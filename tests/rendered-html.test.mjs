import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function walk(url) {
  const entries = await readdir(url, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), url);
    if (entry.isDirectory()) files.push(...await walk(child));
    else files.push(child);
  }
  return files;
}

test("server-renders the finished ARGUS application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>ARGUS — API usage intelligence<\/title>/i);
  assert.match(html, /Bringing the watchtower online/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the browser bundle contains no server credential names or sample secrets", async () => {
  const clientFiles = (await walk(new URL("../dist/client/", import.meta.url))).filter((url) => /\.(?:js|css|html)$/.test(url.pathname));
  const text = (await Promise.all(clientFiles.map((url) => readFile(url, "utf8")))).join("\n");
  assert.doesNotMatch(text, /OPENAI_ADMIN_KEY|ARGUS_SETUP_TOKEN|ARGUS_PASSWORD_PEPPER|sk-admin_replace_me/);
});

test("client code does not read runtime environment variables", async () => {
  const client = await readFile(new URL("../app/components/ArgusApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /process\.env|import\.meta\.env|cloudflare:workers|OPENAI_ADMIN_KEY/);
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.doesNotMatch(envExample, /^(?:VITE_|NEXT_PUBLIC_)[A-Z0-9_]*=/m);
});
