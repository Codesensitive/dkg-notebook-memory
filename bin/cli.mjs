#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { DkgClient, planNotebook, pushPlan, recallAsset } from '../src/index.mjs';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    project: { type: 'string' }, source: { type: 'string' }, agent: { type: 'string' },
    url: { type: 'string' }, help: { type: 'boolean' },
  } });
  const [command, file] = positionals;
  if (values.help || !command) {
    console.log('dkg-notebook-memory plan|push notebook.ipynb --project ID --source URL --agent NAME\ndkg-notebook-memory recall ASSET --project ID\nPush/recall require DKG_TOKEN; --url defaults to http://127.0.0.1:9200.\nOnly cells with metadata.dkg.export=true are selected. Plan performs no network calls.');
  } else {
    if (!['plan', 'push', 'recall'].includes(command) || positionals.length !== 2) throw new Error('Expected plan, push, or recall with one file/asset argument');
    const client = () => new DkgClient({ url: values.url, token: process.env.DKG_TOKEN });
    let result;
    if (command === 'recall') result = await recallAsset(client(), values.project, file);
    else {
      if ((await stat(file)).size > 2 * 1024 * 1024) throw new Error('Notebook exceeds 2 MiB');
      const plan = planNotebook(JSON.parse(await readFile(file, 'utf8')), values);
      result = command === 'plan' ? plan : await pushPlan(plan, client());
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(`dkg-notebook-memory: ${error.message}`);
  process.exitCode = 1;
}
