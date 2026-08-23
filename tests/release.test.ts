import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import packageJson from "../package.json";

test("release version and favicon ship together", async () => {
  assert.equal(packageJson.version, "1.1.0");
  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.match(favicon, /ARGUS watchful eye/);
  assert.match(favicon, /#3EE887/i);
  assert.doesNotMatch(favicon, /#2E9EFF/i);
});

test("password visibility uses an explicit switch instead of a native checkbox", async () => {
  const app = await readFile(new URL("../app/components/ArgusApp.tsx", import.meta.url), "utf8");
  assert.match(app, /className="show-passwords" role="switch" aria-checked=/);
  assert.doesNotMatch(app, /className="show-passwords"><input type="checkbox"/);
  assert.match(app, /href="\/" className="home-mark" aria-label="Go to ARGUS home"/);
});
