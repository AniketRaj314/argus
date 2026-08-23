import assert from "node:assert/strict";
import test from "node:test";
import { externalRequestOrigin, normalizeAppOrigin } from "../lib/server/request-origin";

test("a configured public origin takes precedence over a reverse proxy's internal URL", () => {
  const request = new Request("http://argus.internal:8080/api/auth/login");
  assert.equal(externalRequestOrigin(request, "https://argus.aniketraj.me"), "https://argus.aniketraj.me");
});

test("origins are normalized and unsafe URL shapes are rejected", () => {
  assert.equal(normalizeAppOrigin(" https://argus.aniketraj.me/ "), "https://argus.aniketraj.me");
  assert.throws(() => normalizeAppOrigin("https://argus.aniketraj.me/login"), /must be an HTTP\(S\) origin/);
  assert.throws(() => normalizeAppOrigin("javascript:alert(1)"), /must be an HTTP\(S\) origin/);
});

test("direct local requests continue to use their request URL origin", () => {
  const request = new Request("http://localhost:3000/api/auth/login");
  assert.equal(externalRequestOrigin(request), "http://localhost:3000");
});
