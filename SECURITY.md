# ARGUS security notes

## Trust boundaries

- **Browser:** receives presentation-ready usage aggregates, the signed-in account profile, assigned API Key IDs, and a short-lived session-bound CSRF value. It never receives the OpenAI Admin key, password hashes, password pepper, setup token, session token value through JavaScript, or organization-wide data outside the authenticated scope.
- **ARGUS server:** authenticates accounts, resolves roles and assignments, validates filters, calls OpenAI, and writes audit events.
- **Local ARGUS MCP server:** uses the same server-only database, pepper, and OpenAI boundaries for administrator-approved bulk provisioning. It is a local stdio process, not a public HTTP endpoint.
- **PostgreSQL:** stores accounts, password hashes, hashed session/CSRF values, tracked identifiers, assignments, rate-limit state, and audit events.
- **OpenAI:** receives organization Admin authentication and the exact key-ID filters authorized by ARGUS.

## Deliberate protections

- There is no client-side master password or client-side role decision.
- No route accepts possession of a `key_…` identifier as authentication.
- OpenAI Admin calls live only in `lib/server/openai-usage.ts`, guarded by the `server-only` boundary.
- Mutating endpoints require origin validation, the `X-Argus-Request` marker, authenticated session, session-bound CSRF token, validation, and the correct role.
- Root setup is available only while no root account exists and requires a server-configured setup token.
- Password reset is a root-initiated V1 operation that invalidates all target sessions. Self-service email reset is intentionally out of scope until a trusted mail provider is configured.
- MCP bulk provisioning requires a short-lived preview, exact key matching, revalidation, and an atomic write. Its shared temporary password is read from local process configuration and never enters MCP tool arguments or results.
- Accounts created in bulk or reset by a root user are limited to password change and sign-out until the temporary password is replaced.

## Before public deployment

- Place secrets in the provider's encrypted server secret store; never commit `.dev.vars` or a database connection string.
- Keep `ARGUS_BULK_DEFAULT_PASSWORD` in the local `.dev.vars` only. Do not configure it on Railway or another public application host.
- Use a pooled, TLS-protected PostgreSQL URL in production and keep it server-only. Never prefix it with `NEXT_PUBLIC_`.
- Keep `.env.example` placeholders only. Never add secret values to files prefixed with `VITE_` or `NEXT_PUBLIC_`.
- Enforce HTTPS, a narrow hostname allowlist, and provider/network access controls where available.
- Add a Content Security Policy and security headers at the hosting edge if the provider does not supply them.
- Review database restore procedures and organization audit retention.
- Run `npm run check` and `npm audit --omit=dev` on the exact release artifact.

## Reporting

If you find a security issue, do not include credentials or personal usage data in a public report. Revoke the affected OpenAI Admin key and ARGUS sessions first, then share a minimal reproduction privately with the maintainer.
