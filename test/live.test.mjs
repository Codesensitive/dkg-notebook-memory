import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DkgClient, planNotebook, pushPlan, recallAsset } from '../src/index.mjs';

test('live DKG: write, verified recall, repeat without mutations, revised finding', { skip: !process.env.DKG_LIVE_TEST }, async () => {
  const client = new DkgClient({ url: process.env.DKG_URL, token: process.env.DKG_TOKEN });
  const notebook = JSON.parse(await readFile(new URL('../examples/research.ipynb', import.meta.url)));
  const options = { project: process.env.DKG_PROJECT || 'notebook-demo', source: 'https://example.org/research/demo', agent: `test-${Date.now()}` };
  const plan = planNotebook(notebook, options);
  const first = await pushPlan(plan, client);
  assert.ok(first.receipts.every(r => r.status === 'written' && r.verified));
  const recalled = await recallAsset(client, plan.project, plan.artifacts[0].name);
  assert.ok(recalled.quads.some(q => q.object.includes('testable hypothesis')));
  const repeated = await pushPlan(plan, client);
  assert.ok(repeated.receipts.every(r => r.status === 'already-present'));
  notebook.cells[0].source = 'Revised: measure cold and warm runs separately before drawing a conclusion.';
  const changed = await pushPlan(planNotebook(notebook, options), client);
  assert.equal(changed.receipts[0].status, 'written');
  assert.equal(changed.receipts[1].status, 'already-present');
  // Prior finding remains available: changed content never overwrites history.
  assert.deepEqual((await recallAsset(client, plan.project, plan.artifacts[0].name)).quads, recalled.quads);
});
