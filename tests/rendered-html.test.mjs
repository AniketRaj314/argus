import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { after, test } from "node:test";

const root = new URL("../", import.meta.url);
const port = 39_000 + (process.pid % 1_000);
const origin = `http://127.0.0.1:${port}`;
let serverOutput = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
server.stderr.on("data", (chunk) => { serverOutput += String(chunk); });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return response;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Next.js did not start in time.\n${serverOutput}`);
}

const firstResponse = await waitForServer();

after(() => {
  server.kill("SIGTERM");
});

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

function assertMatchingScriptNonces(response, html) {
  const policy = response.headers.get("content-security-policy") ?? "";
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, "CSP must include a nonce");
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(([tag]) => tag);
  assert.ok(scripts.length > 0, "page must include Next.js bootstrap scripts");
  for (const script of scripts) assert.match(script, new RegExp(`\\bnonce=["']${nonce}["']`));
}

test("server-renders the public ARGUS product page with security headers", async () => {
  assert.equal(firstResponse.status, 200);
  assert.match(firstResponse.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(firstResponse.headers.get("x-frame-options"), "DENY");
  assert.equal(firstResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(firstResponse.headers.get("x-powered-by"), null);
  const policy = firstResponse.headers.get("content-security-policy") ?? "";
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  assert.doesNotMatch(policy.match(/script-src[^;]+/)?.[0] ?? "", /'unsafe-inline'/);
  const html = await firstResponse.text();
  assert.match(html, /<title>ARGUS: Every API key\. Accounted for\.<\/title>/i);
  assert.match(html, /Every API key/i);
  assert.match(html, /href="\/app"/i);
  assert.match(html, /Server-side by design/i);
  assertMatchingScriptNonces(firstResponse, html);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the authenticated ARGUS application is served under /app", async () => {
  const response = await fetch(`${origin}/app`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>ARGUS: API usage intelligence<\/title>/i);
  assert.match(html, /Bringing ARGUS online/i);
  assert.match(html, /noindex/i);
  assertMatchingScriptNonces(response, html);
});

test("the browser bundle contains no server credential names or sample secrets", async () => {
  const clientFiles = (await walk(new URL("../.next/static/", import.meta.url))).filter((url) => /\.(?:js|css|html)$/.test(url.pathname));
  const text = (await Promise.all(clientFiles.map((url) => readFile(url, "utf8")))).join("\n");
  assert.doesNotMatch(text, /OPENAI_ADMIN_KEY|ARGUS_SETUP_TOKEN|ARGUS_PASSWORD_PEPPER|DATABASE_URL|sk-admin_replace_me/);
});

test("client code does not read runtime environment variables", async () => {
  const client = await readFile(new URL("../app/components/ArgusApp.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /process\.env|import\.meta\.env|OPENAI_ADMIN_KEY|DATABASE_URL/);
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.doesNotMatch(envExample, /^(?:VITE_|NEXT_PUBLIC_)[A-Z0-9_]*=/m);
});

test("health page and probe expose safe release status", async () => {
  const page = await fetch(`${origin}/health`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /System status/i);
  assert.match(html, /v(?:<!-- -->)?1\.2\.1/);
  assert.doesNotMatch(html, /DATABASE_URL|OPENAI_ADMIN_KEY|ARGUS_PASSWORD_PEPPER|postgresql:\/\//);

  const probe = await fetch(`${origin}/api/health`);
  assert.ok([200, 503].includes(probe.status));
  const body = await probe.json();
  assert.equal(body.version, "1.2.1");
  assert.ok(["operational", "degraded"].includes(body.status));
  assert.equal(typeof body.responseTimeMs, "number");
});
