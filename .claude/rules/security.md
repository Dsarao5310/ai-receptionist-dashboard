# Security Rules

- Secrets, credentials, tokens, webhook secrets, database credentials, and private
  keys must never enter browser state, client payloads, local storage, logs, or
  public environment variables.
- Provider credentials are stored and used only on the server. Client DTOs expose
  safe configured/health state, never secret values or credential metadata.
- Webhooks must authenticate the exact provider contract, enforce freshness and
  replay protection where applicable, validate schemas, and reject safely without
  leaking diagnostic detail.
- Resolve tenant identity from trusted server mappings. A payload's workspace claim
  never authorizes access.
- Inactive workflow mappings have no inbound authority.
- External actions require authenticated, authorized server entry points and
  workspace-scoped access.
- Cross-tenant leakage is a release blocker. Frontend visibility gates are not
  security controls.
- Validate provider semantic success independently of HTTP or transport success.
- Confirmed external success followed by a failed authoritative local write becomes
  `sync_required`; do not auto-retry the side effect.
- Enforce business-client and platform-admin separation in backend DTOs and routes,
  including redaction of provider identifiers, URLs, workflow references, raw errors,
  and technical configuration.
- Create safe audit events for security-sensitive and important business mutations with
  actor, workspace, action, target, time, and redacted metadata as appropriate.
- Keep staging and production credentials, OAuth clients, databases, URLs, mappings,
  and provider resources isolated. Never copy staging values into production.
- Do not perform destructive production actions, remote resets, secret rotation, or
  other irreversible external operations without explicit approval and verified targets.
