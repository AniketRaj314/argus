# ARGUS

Secure, assignment-scoped OpenAI API usage intelligence.

ARGUS is an out-of-band monitoring dashboard. It reads organization Usage and Costs data with a server-side OpenAI Admin key; it never proxies or participates in normal inference traffic. Root users register OpenAI API Key **IDs** (`key_…`), create accounts, and assign one or many tracked key IDs to each account. Normal users can only query keys assigned to them.

The public product page is served at `/`; the authenticated dashboard and first-run setup live at `/app`. Both pages contain static product UI, but are rendered per request so Next.js can attach a fresh Content Security Policy nonce to every bootstrap script.

## What V1 includes

- Static public product page with a code-rendered demo dashboard
- First-run root setup and a dedicated login screen under `/app`
- Root and user roles with server-enforced authorization
- Self-service password changes with current-password verification and full session invalidation
- Multiple tracked keys per account; root users see every active tracked key
- Optional lifetime per-account credit allocations with consumption, remaining credit, warning, and exceeded states
- 7-day, 30-day, and all-time spend charts, input/output/cached token totals, request counts, model distribution, service mix, per-key rollups, and recent usage
- Root account, automatic OpenAI project-key sync, manual tracked-key fallback, assignment, and audit-trail screens
- Local Codex MCP control for previewed, atomic bulk account provisioning by OpenAI key label
- Responsive dark navy/teal UI with loading, empty, partial-data, and error states
- Public, secret-safe `/health` status page and `/api/health` probe with release metadata
- Server-only OpenAI Usage and Costs integration with cursor pagination and timeouts
- Local demo mode for UI development without an OpenAI credential

## Stack

- React 19 + Next.js App Router
- Standard Node.js runtime for Vercel or Railway
- PostgreSQL (Neon recommended) with Drizzle migrations
- Recharts for data visualization
- Zod for request validation
- Web Crypto PBKDF2-HMAC-SHA-256 password hashing

## Local setup

Requirements: Node.js 22.13 or newer.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.dev.vars` and replace the placeholder values. `.dev.vars` is gitignored and loaded only by the local development command. `DATABASE_URL` should be a pooled PostgreSQL connection string; if it is omitted locally, ARGUS uses `postgresql://localhost:5432/argus`.

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

5. Open `http://localhost:3000` for the public product page, then continue to `http://localhost:3000/app`. On first launch, create the root account using the setup token from `.dev.vars`. Once a root exists, the setup endpoint permanently refuses additional setup requests.

6. Open **Tracked keys** to sync every visible project API Key ID from OpenAI. Manual `key_…` entry remains available as a fallback. Then create accounts and assign keys under **Accounts**.

Account credit limits are one-time monitoring allocations denominated in USD and never reset. ARGUS does not proxy inference requests, so reaching a limit does not stop OpenAI traffic. Consumption is calculated from the all-time cost of currently assigned keys; when a key is shared, its spend counts toward each assigned account because OpenAI key-level usage cannot identify which ARGUS user initiated a request.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Production | Server-only pooled PostgreSQL connection string. |
| `DATABASE_URL_UNPOOLED` | Migrations | Server-only direct PostgreSQL connection string for migration and administration tools. The running app does not read it. |
| `ARGUS_APP_ORIGIN` | Production | Canonical browser-facing origin, such as `https://argus.example.com`. Required when deployed behind a reverse proxy. |
| `OPENAI_ADMIN_KEY` | For live data | Server-only organization Admin key used for Usage and Costs requests. |
| `ARGUS_SETUP_TOKEN` | First run | One-time value required to create the first root account. |
| `ARGUS_PASSWORD_PEPPER` | Recommended | Independent server-only value mixed into password hashing. Keep it stable after launch. |
| `ARGUS_BULK_DEFAULT_PASSWORD` | Local MCP only | Shared temporary password for MCP-created accounts. Store it only in the local `.dev.vars`; do not add it to Railway or browser configuration. |
| `ARGUS_DEMO_MODE` | No | `true` returns deterministic server-generated demo metrics instead of contacting OpenAI. Never enable in production. |
| `ARGUS_DB_POOL_MAX` | No | Per-instance database connection limit; defaults to 1 on Vercel and 5 elsewhere. |

No ARGUS secret uses a public frontend prefix. The client never reads runtime environment variables.

## Bulk onboarding with Codex

ARGUS includes a local stdio MCP server for onboarding a roster without repetitive admin-screen work. It can refresh OpenAI key labels, list the current safe provisioning context, exactly match each roster row by key label or Key ID, preview the complete operation, and atomically create the accounts, lifetime credit allocations, assignments, and audit records after confirmation.

Add a strong shared temporary password to your local `.dev.vars`:

```dotenv
ARGUS_BULK_DEFAULT_PASSWORD=replace_with_your_shared_temporary_password
```

The local MCP process uses the `DATABASE_URL`, `OPENAI_ADMIN_KEY`, and `ARGUS_PASSWORD_PEPPER` already in that file. To manage the deployed ARGUS data, those values must point at the production database and use the same password pepper as production. The bulk password itself is local-only and must not be configured on Railway.

Register the server once:

```bash
codex mcp add argus -- /bin/zsh -lc 'cd /Users/aniket/Code/argus && npm run mcp'
```

Restart Codex, then provide a roster containing an email address, the matching OpenAI key label or exact Key ID, and an optional lifetime USD limit. For example: “Sync my ARGUS keys, then prepare accounts for Alice (`alice@example.com`, key `Alice Sharma`, $200) and Bob (`bob@example.com`, key `Bob Singh`, $500).” Codex will show the exact matches and totals before asking permission to create anything.

Safeguards:

- Email addresses and limits are never inferred. Missing values must be supplied.
- Key-label matching is exact and case-insensitive. Duplicate labels require the exact Key ID.
- A preview expires after 10 minutes and is fully revalidated immediately before creation.
- The apply step is one database transaction; it creates every row or none.
- The temporary password is read only by the local server and is never accepted as tool input, returned, or logged.
- Every new account must replace the temporary password at first sign-in. Until then, server-side access is restricted to password change and sign-out.

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

Every non-root query begins with the authenticated account's assignments from PostgreSQL, then sends only those `api_key_ids` to OpenAI. A requested key filter is checked against that same allowlist before any upstream call. Usage categories that cannot be attributed to an API Key ID are deliberately excluded from user totals to prevent cross-account leakage.

Current official references: [Usage API and Costs API example](https://developers.openai.com/cookbook/examples/completions_usage_api), [OpenAI API reference](https://developers.openai.com/api/reference/overview).

## Security model

- Passwords are salted and hashed with PBKDF2-HMAC-SHA-256 at 600,000 iterations, with an optional server-side pepper.
- Session tokens are random; CSRF tokens are derived per session, and only SHA-256 hashes are stored in PostgreSQL. Session cookies are `HttpOnly` and `SameSite=Strict`; production HTTPS adds `Secure`.
- State-changing requests require an exact same-origin `Origin`, a custom request header, and a session-bound CSRF token.
- Login attempts are rate-limited per hashed IP + normalized email. Login responses do not reveal whether an email exists.
- Disabling an account or changing its password invalidates every existing session.
- New and root-reset accounts must replace their temporary password before accessing dashboard data.
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

## Deploying

ARGUS is a standard Next.js application and uses the same build on Vercel and Railway. Neon is recommended because ARGUS needs plain managed PostgreSQL and Neon provides a pooled connection string suitable for serverless deployments.

### Neon

1. Create a Neon project and open **Connect**.
2. Enable **Pooled connection** and copy the `postgresql://...-pooler...` URL to the server-only `DATABASE_URL`.
3. Disable pooling and copy the direct URL to `DATABASE_URL_UNPOOLED` for migrations. Never give either value a `NEXT_PUBLIC_` prefix.

The application creates missing tables safely on first server request. The checked-in migration can also be applied through your normal migration workflow before the first deployment.

### Vercel

Import the Git repository as a Next.js project and add `DATABASE_URL`, `ARGUS_APP_ORIGIN`, `OPENAI_ADMIN_KEY`, `ARGUS_SETUP_TOKEN`, `ARGUS_PASSWORD_PEPPER`, and `ARGUS_DEMO_MODE=false` under project environment variables. Deploy, visit `/app` on the production URL, and complete the one-time root setup. Keep Preview and Production on separate databases or Neon branches when preview deployments are enabled.

### Railway

Create a service from the Git repository. Railway detects Next.js and uses `npm run build` plus `npm start`. Add the same server-only variables to the service, set `ARGUS_APP_ORIGIN` to the final HTTPS domain, generate a public domain, then complete root setup at `/app`. Set Railway's healthcheck path to `/api/health`; it returns `200` only when the application and database are operational. A Railway PostgreSQL service is also compatible if `DATABASE_URL` points to it.

The human-readable `/health` page reports the application version, deployment revision, environment, safe dependency status, and response time. It intentionally exposes no credentials, database addresses, accounts, or API key identifiers.

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
3. Apply the PostgreSQL migration (or allow the safe first-request initializer to create the schema) and confirm database backups/retention.
4. Serve ARGUS only over HTTPS.
5. Use a long, unique root password and setup token; remove or rotate the setup token after initialization.
6. Restrict deployment access at the network/provider layer where possible.
7. Rotate the OpenAI Admin key immediately if server access is ever suspected.
8. Review audit events and disabled accounts periodically.

## Scope note

API Key IDs are identifiers, not credentials. Possessing a `key_…` value never grants dashboard access. ARGUS requires an authenticated account and a server-side assignment for every normal-user view.
