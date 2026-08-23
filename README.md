# ARGUS

Secure, assignment-scoped OpenAI API usage intelligence.

ARGUS is an out-of-band monitoring dashboard. It reads organization Usage and Costs data with a server-side OpenAI Admin key; it never proxies or participates in normal inference traffic. Root users register OpenAI API Key **IDs** (`key_…`), create accounts, and assign one or many tracked key IDs to each account. Normal users can only query keys assigned to them.

## What V1 includes

- First-run root setup and a dedicated login screen
- Root and user roles with server-enforced authorization
- Multiple tracked keys per account; root users see every active tracked key
- 7-day and 30-day spend charts, input/output/cached token totals, request counts, model distribution, service mix, per-key rollups, and recent usage
- Root account, automatic OpenAI project-key sync, manual tracked-key fallback, assignment, and audit-trail screens
- Responsive dark navy/teal UI with loading, empty, partial-data, and error states
- Server-only OpenAI Usage and Costs integration with cursor pagination and timeouts
- Local demo mode for UI development without an OpenAI credential

## Stack

- React 19 + Vinext App Router
- Cloudflare Workers-compatible server runtime
- Cloudflare D1 / SQLite with Drizzle migrations
- Recharts for data visualization
- Zod for request validation
- Web Crypto PBKDF2-HMAC-SHA-256 password hashing

## Local setup

Requirements: Node.js 22.13 or newer.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.dev.vars` and replace the placeholder values. `.dev.vars` is gitignored and loaded only by the local server.

   Generate independent setup and pepper values, for example:

   ```bash
   openssl rand -base64 48
   ```

3. For a UI-only local preview, set:

   ```dotenv
   ARGUS_DEMO_MODE=true
   ```

   For live data, set `ARGUS_DEMO_MODE=false` and add an organization Admin key as `OPENAI_ADMIN_KEY`. Create the key from the OpenAI organization admin settings. Do not use a project API key.

4. Start ARGUS:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`. On first launch, create the root account using the setup token from `.dev.vars`. Once a root exists, the setup endpoint permanently refuses additional setup requests.

6. Open **Tracked keys** to sync every visible project API Key ID from OpenAI. Manual `key_…` entry remains available as a fallback. Then create accounts and assign keys under **Accounts**.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_ADMIN_KEY` | For live data | Server-only organization Admin key used for Usage and Costs requests. |
| `ARGUS_SETUP_TOKEN` | First run | One-time value required to create the first root account. |
| `ARGUS_PASSWORD_PEPPER` | Recommended | Independent server-only value mixed into password hashing. Keep it stable after launch. |
| `ARGUS_DEMO_MODE` | No | `true` returns deterministic server-generated demo metrics instead of contacting OpenAI. Never enable in production. |

No ARGUS secret uses a public frontend prefix. The client never reads runtime environment variables.

## OpenAI data flow

ARGUS calls the official organization endpoints only from server code:

- `GET /v1/organization/projects`
- `GET /v1/organization/projects/{project_id}/api_keys`
- `GET /v1/organization/costs`
- `GET /v1/organization/usage/completions`
- `GET /v1/organization/usage/embeddings`
- `GET /v1/organization/usage/images`
- `GET /v1/organization/usage/audio_speeches`
- `GET /v1/organization/usage/audio_transcriptions`
- `GET /v1/organization/usage/moderations`
- `GET /v1/organization/usage/file_search_calls`
- `GET /v1/organization/usage/web_search_calls`

Every non-root query begins with the authenticated account's assignments from D1, then sends only those `api_key_ids` to OpenAI. A requested key filter is checked against that same allowlist before any upstream call. Usage categories that cannot be attributed to an API Key ID are deliberately excluded from user totals to prevent cross-account leakage.

Current official references: [Usage API and Costs API example](https://developers.openai.com/cookbook/examples/completions_usage_api), [OpenAI API reference](https://developers.openai.com/api/reference/overview).

## Security model

- Passwords are salted and hashed with PBKDF2-HMAC-SHA-256 at 600,000 iterations, with an optional server-side pepper.
- Session tokens are random; CSRF tokens are derived per session, and only SHA-256 hashes are stored in D1. Session cookies are `HttpOnly` and `SameSite=Strict`; production HTTPS adds `Secure`.
- State-changing requests require an exact same-origin `Origin`, a custom request header, and a session-bound CSRF token.
- Login attempts are rate-limited per hashed IP + normalized email. Login responses do not reveal whether an email exists.
- Disabling an account or changing its password invalidates every existing session.
- Root authorization and key assignment checks run in each relevant API handler; hidden buttons are never treated as authorization.
- Audit records exclude fields whose names resemble passwords, tokens, or secrets. Client IPs are hashed before storage.
- Responses containing account or usage information are marked private and `no-store`.
- The browser bundle is tested to ensure server credential names and sample secrets are absent.

See [SECURITY.md](./SECURITY.md) for the deployment checklist and trust boundaries.

## Database and migrations

The local server initializes missing tables safely for development. Checked-in Drizzle migrations live under `drizzle/` for managed deployments.

After changing `db/schema.ts`:

```bash
npm run db:generate
```

Review the generated SQL before deployment.

## Validation

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` produces a deployment build, verifies password hashing behavior, checks the rendered application shell, and scans the browser bundle for server credential leakage.

## Production checklist

1. Set `ARGUS_DEMO_MODE=false` or omit it.
2. Store all environment values in the hosting provider's encrypted server secret store.
3. Apply the D1 migrations and confirm database backups/retention.
4. Serve ARGUS only over HTTPS.
5. Use a long, unique root password and setup token; remove or rotate the setup token after initialization.
6. Restrict deployment access at the network/provider layer where possible.
7. Rotate the OpenAI Admin key immediately if server access is ever suspected.
8. Review audit events and disabled accounts periodically.

## Scope note

API Key IDs are identifiers, not credentials. Possessing a `key_…` value never grants dashboard access. ARGUS requires an authenticated account and a server-side assignment for every normal-user view.
