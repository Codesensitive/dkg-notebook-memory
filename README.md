# DKG Notebook Memory

Save selected Jupyter notebook findings to private DKG v10 Working Memory, then recall them in later research sessions. Each finding retains its source cell, content digest, author label, status and tags. Changed findings become new revisions; older findings remain readable.

This integration is a bounty submission candidate, not an accepted or rewarded integration. Developed with AI assistance for Codesensitive.

## Requirements

- Node.js 22.13+.
- A running DKG v10 node (tested with 10.0.18) and an existing Context Graph.
- Its bearer token in `DKG_TOKEN`. Get it through `dkg auth show`; do not commit it.
- No paid API, LLM, blockchain transaction or third-party account is needed to use this integration.

## Select findings

Set metadata on the notebook cells you want the research agent to retain:

```json
{"dkg":{"export":true,"status":"hypothesis","tags":["latency"]}}
```

Cells need stable Jupyter cell IDs. Status may be `draft`, `hypothesis`, `observation`, or `conclusion`. These are author-supplied research labels, not verification claims. Only selected cell source text is copied. Outputs, attachments, execution counts, unselected cells and other metadata are excluded. Selected text can still contain secrets: review the plan before writing.

## Run from source

```sh
node bin/cli.mjs plan examples/research.ipynb --project notebook-demo --source https://example.org/research/demo --agent researcher
node bin/cli.mjs push examples/research.ipynb --project notebook-demo --source https://example.org/research/demo --agent researcher
node bin/cli.mjs recall ASSET_NAME_FROM_RECEIPT --project notebook-demo
```

`plan` is entirely offline. `push` requires `DKG_TOKEN`. All commands output JSON for agent orchestration. Use `--url http://127.0.0.1:19200` for a non-default node port. Only literal loopback IP origins are accepted; use a local tunnel for remote nodes. No credential is placed in command arguments.

The source URL identifies the notebook; it is never fetched. Use a stable URL without credentials or query strings. The agent name is a self-declared provenance label, not an authenticated identity or endorsement.

## Research-agent workflow

1. The researcher or notebook agent marks findings worth retaining.
2. The agent runs `plan` and inspects the exact outgoing triples.
3. It runs `push` into an existing project Context Graph.
4. It stores the returned asset names with its experiment record.
5. In a later session, it runs `recall` to recover the finding and its source.
6. Revised notebook content produces a different revision without replacing the prior evidence.

No notebook code is executed. JSON is parsed as data and markdown remains text.

## Tests

```sh
npm test
```

The live test is skipped unless explicitly enabled. Against a running node with an existing Context Graph, set `DKG_TOKEN`, `DKG_URL`, `DKG_PROJECT` and `DKG_LIVE_TEST=1`, then run `npm test`. The live test writes synthetic example findings and retains them to exercise revision history. It never SHAREs or PUBLISHes.

## Limits

2 MiB notebook, 100 selected cells, 32 KiB source per selected cell. Writes are serial, not transactional across a notebook. If one fails, earlier verified findings remain; rerun the same command to resume. A matching existing artifact is skipped. A non-empty conflicting artifact causes failure, not overwrite. Concurrent writers to the same generated asset name are not supported; serialize jobs per project.

This version retains WM drafts without sealing or sharing. It does not imply cryptographic verification, team replication or on-chain persistence. The DKG node owns authentication, storage and lifecycle authority. Remote transport, automatic notebook watching, output ingestion, and a Jupyter UI extension are outside this version.

See [design and promotion path](docs/DESIGN.md) and [security](docs/SECURITY.md).

Registry installation supports DKG_AUTH_TOKEN and DKG_API_URL. DKG_TOKEN remains a fallback; an explicit --url takes precedence.
