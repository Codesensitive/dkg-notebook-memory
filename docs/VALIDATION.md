# Validation — 24 September 2026

Nine tests passed, zero failed, zero skipped, against Node.js 24.21.0 on Windows and a real DKG 10.0.18 daemon (published build commit 382258fa43b1a0dd8ef2091ba6048b90e6890581).

The daemon used an isolated workspace directory, Oxigraph worker storage, mock blockchain adapter, disabled relay connections and disabled auto-updates/telemetry. Thus this validates actual HTTP and storage compatibility without claiming blockchain or peer-network validation.

Live checks: write two selected findings; read back exact triples; recall the hypothesis; repeat without new writes; edit one finding; verify a new revision is created and the old finding remains readable.

Unit/transport checks: export exclusion; deterministic identity; invalid input and duplicate IDs; Unicode/RDF escaping; interrupted empty draft recovery; refusal to overwrite conflicting content; authentication failure and mismatched readback; redirect rejection and local-only transport.

Integration testing caught and corrected an API assumption: missing WM data can return HTTP 200 with empty quads. Empty drafts are now opened/created before writing. Test setup also explicitly creates its Context Graph; the integration itself requires an existing graph.

Not yet verified: registry acceptance, npm provenance, independent user adoption, curator promotion, or payment. No bounty award is claimed.
