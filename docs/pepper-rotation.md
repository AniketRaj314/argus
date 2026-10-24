# Password pepper rotation

Peppers are server-only secrets. Never put them in browser variables, command arguments, source control, logs, or status output. All consumers sharing a database must use the same pepper configuration, including the local bulk-provisioning MCP server.

## How migration works

- Existing four-part PBKDF2 hashes belong to the reserved `legacy` version.
- New versioned records use `peppered$VERSION$pbkdf2-sha256$...` in the existing `password_hash` column. The version is a label, not the secret. No schema migration is required.
- A successful login with a previous-version password replaces its hash using the current pepper, a fresh salt, and the existing 600,000-iteration PBKDF2 policy.
- Compare-and-swap prevents concurrent resets or logins from overwriting newer hashes. Failed logins do not migrate anything.
- Migration does not change the user's password, forced-change flag, role, limits, assignments, or password-change timestamp. A version-only `auth.pepper_migrated` audit event records successful upgrades.
- Setup, admin creation/reset, self-service password changes, and MCP onboarding all write the current version.
- Existing sessions remain valid. Their stored CSRF tokens are preserved while their pepper is available. Login lockout windows are checked against both configured peppers.

## Safe rollout

1. Generate a strong independent replacement secret privately. Choose a distinct version label, for example `2026-10`. Keep the existing secret available until migration is complete.
2. Deploy compatibility code before switching the active pepper. Stage the replacement as `ARGUS_PASSWORD_PEPPER_PREVIOUS` with its new version in `ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION`. Keep `ARGUS_PASSWORD_PEPPER` and its version unchanged (`legacy` for the first rotation). Set `ARGUS_PASSWORD_PEPPER_MIGRATE=false` so staged replicas can read both versions without downgrading hashes.
3. Verify all replicas run the compatibility code. Stop stale local/MCP writers. Verify an existing login and read-only database access. For the first deployment, unversioned legacy writes remain readable by the old application during rollout.
4. Swap the secrets and version labels: replacement becomes current, old becomes previous. Set `ARGUS_PASSWORD_PEPPER_MIGRATE=true`. Update local configuration to match and redeploy the compatibility build. Never switch the current secret without retaining the previous secret and correct label.
5. Restart MCP with the updated environment. Verify an existing login upgrades its hash once, a second login succeeds with the current version, existing sessions still work, and no secret reaches the client bundle. Do not run key sync or create accounts for verification.
6. After any new-version hash exists, do not roll back to code that cannot read versioned records. Roll back only to a compatibility build with both secrets retained. Do not switch the current version backward while migration is enabled.

## Inactive accounts and retirement

Run `npm run pepper:status` for counts. This queries the database directly without schema writes or key syncs. Add `-- --accounts` to list pending account emails and states for an administrator; hashes and secrets are never printed. Disabled accounts count as pending because they might be re-enabled later. Deleted accounts are excluded because they cannot sign in.

There is no automatic expiry or forced reset in this rollout. Inactive users can return and migrate normally while the previous pepper remains configured. The security tradeoff is that the exposed old pepper remains usable for their old hashes until they migrate or are reset.

To retire it promptly, choose a cutoff, ask pending users to sign in, then use the existing admin password-reset flow for remaining accounts. Share unique temporary passwords securely. Resets use the current pepper, revoke their sessions, and require a password change at the next login. Disabling an account alone does not migrate its hash. Coordinate resets before re-enabling disabled accounts.

Remove both previous-pepper variables only when the report shows zero pending and zero unknown-version accounts across the shared database, and all deployments/MCP processes use the current writer. For a seamless session transition, allow the seven-day session lifetime to pass after the last old-writer deployment, or deliberately sign out remaining old sessions with user approval. Removing the old pepper earlier does not invalidate session cookies, but an old open tab may need a refresh to obtain its current CSRF token.

Recheck database access, current login, and MCP initialization after retirement. Delete private temporary transfer files. Never silently reset or disable inactive accounts as part of the status check.
