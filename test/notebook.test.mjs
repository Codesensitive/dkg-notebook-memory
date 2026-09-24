import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { planNotebook, pushPlan, DkgClient, DkgHttpError } from '../src/index.mjs';

const example = JSON.parse(await readFile(new URL('../examples/research.ipynb', import.meta.url)));
const options = { project: 'demo', source: 'https://example.org/notebook', agent: 'researcher' };

test('exports only explicitly selected sources, never outputs, attachments or unrelated metadata', () => {
  const book = structuredClone(example);
  book.cells[0].attachments = { secret: 'ATTACHMENT_SECRET' };
  book.cells[0].metadata.other = 'METADATA_SECRET';
  book.cells[1].outputs = [{ text: 'OUTPUT_SECRET' }];
  const plan = planNotebook(book, options);
  assert.equal(plan.artifacts.length, 2);
  const serialized = JSON.stringify(plan);
  for (const excluded of ['ATTACHMENT_SECRET', 'OUTPUT_SECRET', 'METADATA_SECRET', 'private scratch']) assert.ok(!serialized.includes(excluded));
});

test('cell identity survives reordering, while edited content creates a distinct revision', () => {
  const old = planNotebook(example, options);
  const book = structuredClone(example);
  book.cells.reverse();
  const reordered = planNotebook(book, options);
  assert.equal(old.artifacts[0].name, reordered.artifacts[1].name);
  book.cells[2].source = 'Revised hypothesis';
  const changed = planNotebook(book, options);
  assert.notEqual(old.artifacts[0].name, changed.artifacts[1].name);
  const stable = a => a.quads.find(q => q.predicate.endsWith('specializationOf')).object;
  assert.equal(stable(old.artifacts[0]), stable(changed.artifacts[1]));
});

test('rejects malformed input, secret-bearing source URLs, and duplicate IDs', () => {
  assert.throws(() => planNotebook({}, options), /format 4/);
  assert.throws(() => planNotebook(example, { ...options, source: 'https://example.org/n?token=private' }), /without credentials/);
  const book = structuredClone(example); book.cells[1].id = book.cells[0].id;
  assert.throws(() => planNotebook(book, options), /unique/);
  assert.throws(() => planNotebook(example, { ...options, project: '../escape' }), /project/);
  assert.throws(() => planNotebook({ ...example, cells: [] }, options), /No cells/);
});

test('RDF literals round-trip newlines, quotes, backslashes and unicode', () => {
  const book = structuredClone(example);
  const original = 'line 1\n"quoted" \\ path ₹ नमस्ते'; book.cells[0].source = original;
  const quad = planNotebook(book, options).artifacts[0].quads.find(q => q.predicate.endsWith('/text'));
  assert.equal(JSON.parse(quad.object), original);
});

function fakeNode() {
  const assets = new Map(); const calls = [];
  return { assets, calls, async request(method, path, body) {
    calls.push({ method, path });
    if (method === 'GET') { const name = path.split('/')[3]; if (!assets.has(name)) throw new DkgHttpError(404); return { quads: assets.get(name) }; }
    if (path === '/api/knowledge-assets') { assets.set(body.name, []); return {}; }
    assets.set(path.split('/')[3], body.quads); return {};
  } };
}

test('writes and verifies WM; second push performs no mutations', async () => {
  const node = fakeNode(); const plan = planNotebook(example, options);
  const first = await pushPlan(plan, node);
  assert.ok(first.receipts.every(r => r.status === 'written' && r.verified));
  node.calls.length = 0;
  const second = await pushPlan(plan, node);
  assert.ok(second.receipts.every(r => r.status === 'already-present'));
  assert.ok(node.calls.every(c => c.method === 'GET'));
});

test('recovers empty draft after interruption and refuses non-empty conflicting assets', async () => {
  const node = fakeNode(); const plan = planNotebook(example, options);
  node.assets.set(plan.artifacts[0].name, []);
  await pushPlan(plan, node);
  assert.equal(node.calls.filter(c => c.path === '/api/knowledge-assets').length, 2);
  node.assets.set(plan.artifacts[0].name, [{ subject: 'urn:a', predicate: 'urn:b', object: '"changed"' }]);
  await assert.rejects(pushPlan(plan, node), /refusing to overwrite/);
});

test('authentication failures never trigger create; mismatched readback never claims success', async () => {
  const plan = planNotebook(example, options);
  const authFailure = { request: async () => { throw new DkgHttpError(401); } };
  await assert.rejects(pushPlan(plan, authFailure), /401/);
  const node = fakeNode(); const request = node.request.bind(node);
  node.request = async (...args) => { const result = await request(...args); if (args[0] === 'GET') return { quads: [] }; return result; };
  await assert.rejects(pushPlan(plan, node), /Readback mismatch/);
});

test('transport rejects remote hosts, credentials and redirects', async t => {
  for (const url of ['https://example.com', 'http://localhost:9200', 'http://127.0.0.1/path', 'http://user:pass@127.0.0.1']) {
    assert.throws(() => new DkgClient({ url, token: 'test' }), /loopback/);
  }
  const server = createServer((req, res) => { res.writeHead(302, { Location: 'http://127.0.0.1:1/leak' }); res.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const client = new DkgClient({ url: `http://127.0.0.1:${server.address().port}`, token: 'test' });
  await assert.rejects(client.request('GET', '/api/status'));
});
