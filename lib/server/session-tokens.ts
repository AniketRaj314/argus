import { constantTimeEqual, sha256 } from "./crypto";

export function csrfTokenForPepper(sessionToken: string, pepper: string) {
  return sha256(`argus-csrf\u0000${sessionToken}\u0000${pepper}`);
}

export async function selectCsrfToken(sessionToken: string, storedHash: string, peppers: string[]) {
  const current = await csrfTokenForPepper(sessionToken, peppers[0]);
  for (const pepper of peppers) {
    const candidate = await csrfTokenForPepper(sessionToken, pepper);
    if (constantTimeEqual(await sha256(candidate), storedHash)) return { token: candidate, changed: false };
  }
  return { token: current, changed: true };
}
