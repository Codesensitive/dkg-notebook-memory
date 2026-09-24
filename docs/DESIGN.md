# Design brief

## Problem and target workflow

Notebook research mixes scratch code, tentative hypotheses, observations and conclusions. Saving a whole notebook into agent memory can expose irrelevant output and erase the distinction between a guess and an observed result. Notebook Memory connects existing Jupyter `.ipynb` files to DKG Working Memory through an agent-callable CLI and JavaScript API.

The initial user is a researcher or autoresearch agent resuming experiments across sessions. The example notebook and live test demonstrate the workflow; no external adoption is claimed.

## Mapping to DKG v10

The operator chooses an existing project's Context Graph. Each selected cell revision is a named Working Memory assertion. We use only the public HTTP API: create the assertion, write RDF triples, and read the triples back. Success is recorded only when the readback matches the intended set. No internal DKG packages are imported.

Content-addressed names use SHA-256 over the selected source, stable cell ID, source notebook URL, author label, cell type, status and sorted tags. Cell positions and execution outputs are intentionally excluded. Reordering cells preserves identity; editing a finding creates a new revision. PROV-O `specializationOf` links revisions to the stable source cell entity. `wasDerivedFrom` identifies the source notebook cell and `wasAttributedTo` records the self-declared research agent.

The CLI emits JSON for agent consumption and performs no implicit network operations during planning. The agent determines which findings to retain by setting explicit cell metadata. There is no conflict-resolution UI or voting UI.

## Promotion path and oracle readiness

This release stops in private Working Memory. An authorized Curator can subsequently finalize the named assertion and SHARE it through the standard DKG lifecycle. PUBLISH remains a separate, explicitly authorized operation that may spend funds. The integration neither invokes nor bypasses these operations.

A UAL exists only after actual VM publication. We therefore do not fabricate UALs for WM drafts. A downstream promotion process should retain the source URI, assertion name, digest and returned real UAL, along with the node's seal/author information. Context oracles can consume the promoted entity's provenance and research-status triples, but must independently evaluate source reliability and the DKG verification level. The literal `memoryLayer` stored in a finding describes its ingestion stage; downstream consumers must query the node's current lifecycle rather than treating that literal as current authority.

## Scope and tradeoffs

Stable, inspectable per-cell findings are preferred over opaque full-notebook blobs. The package has no runtime dependencies or installation scripts. It does not execute code or use an LLM to claim that source text is true. Human/agent-assigned observation or conclusion labels are not evidence of successful execution.

Writes across cells are not atomic. Verified content is preserved on later failures and reruns skip exact matches. Concurrent same-asset jobs must be serialized. Exporting notebook output may be valuable in a future release, but requires a separate explicit policy for images, credentials and measured-result provenance.

## Maintenance

Maintainer: [Codesensitive](https://github.com/Codesensitive). The account owner accepts responsibility for at least six months of support after program acceptance. Report bugs through this repository's GitHub issues.
