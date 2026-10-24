import "server-only";
import { getDb, getRuntimeEnv } from "../../db";
import { hashPasswordRecord, readPepperConfig, verifyAndUpgradePassword, verifyPasswordRecord } from "./password-record";

export function passwordPeppers() {
  return readPepperConfig(getRuntimeEnv());
}

export function hashAccountPassword(password: string) {
  return hashPasswordRecord(password, passwordPeppers());
}

export async function verifyAccountPassword(password: string, hash: string) {
  return (await verifyPasswordRecord(password, hash, passwordPeppers())).valid;
}

export function verifyLoginPassword(password: string, accountId: string, hash: string) {
  return verifyAndUpgradePassword(password, hash, passwordPeppers(), {
    async compareAndSwap(oldHash, newHash) {
      const row = await getDb().prepare(`UPDATE accounts SET password_hash = ?
        WHERE id = ? AND password_hash = ? AND status = 'active' AND deleted_at IS NULL RETURNING id`)
        .bind(newHash, accountId, oldHash).first<{ id: string }>();
      return !!row;
    },
    async readActiveHash() {
      const row = await getDb().prepare("SELECT password_hash FROM accounts WHERE id = ? AND status = 'active' AND deleted_at IS NULL")
        .bind(accountId).first<{ password_hash: string }>();
      return row?.password_hash ?? null;
    },
  });
}
