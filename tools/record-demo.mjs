import { readFile, writeFile } from 'node:fs/promises';
import { DkgClient, planNotebook, pushPlan, recallAsset } from '../src/index.mjs';

const frames = []; let time = 0;
const say = value => { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); frames.push([time, 'o', text.replace(/\n/g, '\r\n') + '\r\n\r\n']); time += 6; console.log(text); };
const book = JSON.parse(await readFile(new URL('../examples/research.ipynb', import.meta.url)));
const plan = planNotebook(book, { project: process.env.DKG_PROJECT || 'notebook-demo', source: 'https://example.org/research/demo', agent: `demo-${Date.now()}` });
const client = new DkgClient({ url: process.env.DKG_URL, token: process.env.DKG_TOKEN });
say('DKG Notebook Memory — live HTTP walkthrough\nReal DKG 10.0.18; mock blockchain; no SHARE or PUBLISH.\nReading pauses added to this terminal recording.');
say({ step: '1. Plan selected notebook cells', selected: plan.artifacts.map(a => a.cellId), excluded: 'Unmarked scratch cell, all outputs and attachments' });
const written = await pushPlan(plan, client);
say({ step: '2. Push and verify readback', results: written.receipts.map(r => ({ cell: r.cellId, status: r.status, verified: r.verified })) });
const recalled = await recallAsset(client, plan.project, plan.artifacts[0].name);
say({ step: '3. Recall in a later agent step', source: recalled.quads.find(q => q.predicate.endsWith('wasDerivedFrom'))?.object, finding: JSON.parse(recalled.quads.find(q => q.predicate === 'https://schema.org/text').object) });
const repeated = await pushPlan(plan, client);
say({ step: '4. Repeat safely', results: repeated.receipts.map(r => ({ cell: r.cellId, status: r.status })) });
say('Completed: selected findings stored and recalled.\nThis recording demonstrates functionality, not a bounty award.');
const header = { version: 2, width: 110, height: 36, timestamp: Math.floor(Date.now()/1000), title: 'DKG Notebook Memory live demo', env: { TERM: 'xterm-256color' } };
await writeFile(new URL('../docs/demo.cast', import.meta.url), [JSON.stringify(header), ...frames.map(f => JSON.stringify(f))].join('\n')+'\n');
