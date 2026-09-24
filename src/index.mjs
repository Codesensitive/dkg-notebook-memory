import { createHash } from 'node:crypto';

const NS = 'urn:dkg-notebook-memory:';
const SCHEMA = 'https://schema.org/';
const PROV = 'http://www.w3.org/ns/prov#';
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => JSON.stringify(String(value));
const MAX_BYTES = 2 * 1024 * 1024;
const projectId = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,511}$/.test(value) || value.includes('..')) throw new Error('Invalid project');
  return value;
};
const identifier = (value, field) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)) throw new Error(`Invalid ${field}`);
  return value;
};
const text = value => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join('');
  throw new Error('Notebook cell source must be text or an array of text');
};

/** Build a deterministic plan. No files are executed; no network calls occur. */
export function planNotebook(notebook, { project, source, agent } = {}) {
  projectId(project);
  identifier(agent, 'agent');
  let sourceUrl;
  try { sourceUrl = new URL(source); } catch { throw new Error('Source must be an absolute HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password || sourceUrl.search || sourceUrl.hash) {
    throw new Error('Source must be an HTTP(S) URL without credentials, query or fragment');
  }
  if (notebook?.nbformat !== 4 || !Array.isArray(notebook.cells)) throw new Error('Expected Jupyter notebook format 4');
  if (Buffer.byteLength(JSON.stringify(notebook)) > MAX_BYTES) throw new Error('Notebook exceeds 2 MiB limit');
  const selected = notebook.cells.map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell?.metadata?.dkg?.export === true);
  if (!selected.length) throw new Error('No cells selected: set metadata.dkg.export=true on intended findings');
  if (selected.length > 100) throw new Error('Select at most 100 cells per notebook');
  const artifacts = selected.map(({ cell, index }) => {
    if (!['markdown', 'code'].includes(cell.cell_type)) throw new Error('Only markdown and code cells are supported');
    const id = identifier(cell.id, 'cell id (stable IDs required)');
    const content = text(cell.source);
    if (!content.trim() || Buffer.byteLength(content) > 32768) throw new Error('Selected cell must contain 1–32768 bytes of text');
    const status = cell.metadata.dkg.status ?? 'draft';
    if (!['draft', 'hypothesis', 'observation', 'conclusion'].includes(status)) throw new Error('Unsupported finding status');
    const tags = cell.metadata.dkg.tags ?? [];
    if (!Array.isArray(tags) || tags.length > 20 || tags.some(t => typeof t !== 'string' || t.length > 80)) throw new Error('Invalid tags');
    const cellUri = `${sourceUrl.href}#cell-${encodeURIComponent(id)}`;
    const payload = { source: sourceUrl.href, agent, id, type: cell.cell_type, content, status, tags: [...new Set(tags)].sort() };
    const digest = hash(JSON.stringify(payload));
    const name = `nb-${digest}`;
    const subject = `${NS}revision:${digest}`;
    const quads = [];
    const add = (predicate, object) => quads.push({ subject, predicate, object });
    add('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', `${PROV}Entity`);
    add(`${PROV}wasDerivedFrom`, cellUri);
    add(`${PROV}wasAttributedTo`, `${NS}agent:${agent}`);
    add(`${PROV}specializationOf`, `${NS}cell:${hash(cellUri)}`);
    add(`${SCHEMA}text`, literal(content));
    add(`${SCHEMA}encodingFormat`, literal(cell.cell_type === 'markdown' ? 'text/markdown' : 'text/plain'));
    add(`${NS}findingStatus`, literal(status));
    add(`${NS}sha256`, literal(digest));
    add(`${NS}memoryLayer`, literal('working-memory'));
    for (const tag of payload.tags) add(`${SCHEMA}keywords`, literal(tag));
    return { name, cellId: id, cellIndex: index, digest, quads };
  });
  if (new Set(artifacts.map(a => a.cellId)).size !== artifacts.length) throw new Error('Selected cell IDs must be unique');
  return { format: 'dkg-notebook-memory/v1', project, source: sourceUrl.href, agent, artifacts };
}

export class DkgHttpError extends Error {
  constructor(status) { super(`DKG returned HTTP ${status}`); this.status = status; }
}

/** Local-only transport. Never follows redirects with a bearer credential. */
export class DkgClient {
  constructor({ url = 'http://127.0.0.1:9200', token, timeoutMs = 15000 } = {}) {
    const parsed = new URL(url);
    if (!['127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('DKG URL must be an HTTP loopback IP origin, e.g. http://127.0.0.1:9200');
    }
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw new Error('DKG_TOKEN is required');
    this.url = parsed.origin; this.token = token; this.timeoutMs = timeoutMs;
  }
  async request(method, path, body) {
    const response = await fetch(this.url + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new DkgHttpError(response.status); }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length;
        if (size > 4 * MAX_BYTES) throw new Error('DKG response exceeds 8 MiB');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
}

const canonical = quads => [...new Set(quads.map(({ subject, predicate, object }) => JSON.stringify([subject, predicate, object])))].sort();
export function sameQuads(actual, expected) {
  return Array.isArray(actual) && JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected));
}

/** Requires an existing Context Graph. Does not SHARE, PUBLISH, seal or execute code. */
export async function pushPlan(plan, client) {
  if (plan?.format !== 'dkg-notebook-memory/v1' || !Array.isArray(plan.artifacts)) throw new Error('Invalid plan');
  projectId(plan.project);
  const receipts = [];
  for (const artifact of plan.artifacts) {
    identifier(artifact.name, 'asset name');
    const path = `/api/knowledge-assets/${encodeURIComponent(artifact.name)}`;
    const query = `?contextGraphId=${encodeURIComponent(plan.project)}`;
    let existing;
    try { existing = await client.request('GET', path + '/wm/quads' + query); }
    catch (error) { if (!(error instanceof DkgHttpError) || error.status !== 404) throw error; }
    if (existing && sameQuads(existing.quads, artifact.quads)) {
      receipts.push({ name: artifact.name, cellId: artifact.cellId, status: 'already-present', verified: true });
      continue;
    }
    if (existing && !Array.isArray(existing.quads)) throw new Error('Invalid DKG read response');
    if (existing?.quads?.length) throw new Error(`Asset ${artifact.name} differs from plan; refusing to overwrite`);
    // Existing empty drafts can be recovered after an interrupted create/write.
    await client.request('POST', '/api/knowledge-assets', { contextGraphId: plan.project, name: artifact.name });
    await client.request('POST', path + '/wm/write', { contextGraphId: plan.project, quads: artifact.quads });
    const readback = await client.request('GET', path + '/wm/quads' + query);
    if (!sameQuads(readback.quads, artifact.quads)) throw new Error(`Readback mismatch for ${artifact.name}; no success receipt issued`);
    receipts.push({ name: artifact.name, cellId: artifact.cellId, status: 'written', verified: true });
  }
  return { format: 'dkg-notebook-receipt/v1', project: plan.project, memoryLayer: 'working-memory', receipts };
}

export async function recallAsset(client, project, name) {
  projectId(project); identifier(name, 'asset name');
  const result = await client.request('GET', `/api/knowledge-assets/${encodeURIComponent(name)}/wm/quads?contextGraphId=${encodeURIComponent(project)}`);
  if (!Array.isArray(result.quads)) throw new Error('Invalid DKG read response');
  return { memoryLayer: 'working-memory', project, name, quads: result.quads };
}
