# Security and authority

- Egress: only the configured HTTP loopback IP DKG node. Source URLs are identifiers and are not fetched.
- Credentials: DKG bearer token from the environment. Redirects are rejected; error messages omit response bodies and tokens.
- Writes: `POST /api/knowledge-assets` and `POST /api/knowledge-assets/{name}/wm/write`.
- Reads: `GET /api/knowledge-assets/{name}/wm/quads` scoped by Context Graph.
- No SHARE, PUBLISH, wallet, signing, staking, or Context Graph creation calls in the integration.
- No dynamic code loading, notebook execution, lifecycle install scripts, telemetry, or runtime dependencies.
- Explicit export metadata is an allowlist, not a secret scanner. The operator must inspect selected source before push. Planning prints the selected text to stdout, which may be logged by the caller.
- Loopback transport assumes a trusted local machine. Untrusted local processes may impersonate services; remote and shared-host deployment needs additional operational protection.
- Limits bound input cells and transport response size. Each request has a timeout. A failed write is not silently retried; rerunning checks stored content first.
- Receipts prove an HTTP readback matched the plan, not cryptographic truth or an awarded bounty.
