import { hashPassword, verifyPassword } from "./crypto";

export type Pepper = { version: string; secret: string };
export type PepperConfig = { current: Pepper; previous?: Pepper; migrateOnLogin?: boolean };
export type PepperEnvironment = {
  ARGUS_PASSWORD_PEPPER?: string;
  ARGUS_PASSWORD_PEPPER_VERSION?: string;
  ARGUS_PASSWORD_PEPPER_PREVIOUS?: string;
  ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION?: string;
  ARGUS_PASSWORD_PEPPER_MIGRATE?: string;
};

const VERSION = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const PREFIX = "peppered$";

export function readPepperConfig(env: PepperEnvironment): PepperConfig {
  const current = {
    version: env.ARGUS_PASSWORD_PEPPER_VERSION ?? "legacy",
    secret: env.ARGUS_PASSWORD_PEPPER ?? "",
  };
  const previousSecret = env.ARGUS_PASSWORD_PEPPER_PREVIOUS;
  const previousVersion = env.ARGUS_PASSWORD_PEPPER_PREVIOUS_VERSION;
  const migration = env.ARGUS_PASSWORD_PEPPER_MIGRATE;
  const policy = migration === "false" ? { migrateOnLogin: false } : {};
  if (!current.secret || !VERSION.test(current.version)
    || (migration !== undefined && migration !== "true" && migration !== "false")
    || (previousSecret !== undefined) !== (previousVersion !== undefined)) {
    throw new Error("Password pepper configuration is incomplete.");
  }
  if (previousSecret !== undefined && previousVersion !== undefined) {
    if (!previousSecret || !VERSION.test(previousVersion) || previousVersion === current.version
      || previousSecret === current.secret) {
      throw new Error("Password pepper versions must be distinct and fully configured.");
    }
    return { current, previous: { version: previousVersion, secret: previousSecret }, ...policy };
  }
  return { current, ...policy };
}

export function passwordRecordVersion(encoded: string): string | null {
  if (encoded.startsWith("pbkdf2-sha256$")) return "legacy";
  if (!encoded.startsWith(PREFIX)) return null;
  const version = encoded.split("$")[1];
  return version && VERSION.test(version) ? version : null;
}

export async function hashPasswordRecord(password: string, config: PepperConfig): Promise<string> {
  const hash = await hashPassword(password, config.current.secret);
  // Keep the initial compatibility deployment readable by the pre-rotation app.
  return config.current.version === "legacy" ? hash : `${PREFIX}${config.current.version}$${hash}`;
}

export async function verifyPasswordRecord(password: string, encoded: string, config: PepperConfig) {
  const version = passwordRecordVersion(encoded);
  const pepper = [config.current, config.previous].find((entry) => entry && entry.version === version);
  if (!pepper) return { valid: false, needsUpgrade: false, version };
  const hash = encoded.startsWith(PREFIX) ? encoded.split("$").slice(2).join("$") : encoded;
  const valid = await verifyPassword(password, hash, pepper.secret);
  return { valid, needsUpgrade: valid && version !== config.current.version && config.migrateOnLogin !== false, version };
}

export type PasswordStore = {
  // Null also means the account was deleted or disabled during verification.
  readActiveHash(): Promise<string | null>;
  compareAndSwap(oldHash: string, newHash: string): Promise<boolean>;
};

export async function verifyAndUpgradePassword(
  password: string, encoded: string, config: PepperConfig, store: PasswordStore,
) {
  let hash = encoded;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await verifyPasswordRecord(password, hash, config);
    if (!result.valid) return { valid: false, migrated: false, fromVersion: result.version };
    if (!result.needsUpgrade) return { valid: true, migrated: false, fromVersion: result.version };
    const replacement = await hashPasswordRecord(password, config);
    if (await store.compareAndSwap(hash, replacement)) {
      return { valid: true, migrated: true, fromVersion: result.version };
    }
    // A concurrent password reset must never be overwritten by lazy migration.
    const latest = await store.readActiveHash();
    if (!latest) return { valid: false, migrated: false, fromVersion: result.version };
    hash = latest;
  }
  return { valid: false, migrated: false, fromVersion: null };
}
