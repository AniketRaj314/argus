import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import packageJson from "../package.json";

test("release version and favicon ship together", async () => {
  assert.equal(packageJson.version, "1.0.0");
  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.match(favicon, /ARGUS watchful eye/);
  assert.match(favicon, /#3EE887/i);
  assert.doesNotMatch(favicon, /#2E9EFF/i);
});
