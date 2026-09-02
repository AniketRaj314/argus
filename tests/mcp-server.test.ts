import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("the local ARGUS MCP server advertises preview-first bulk provisioning tools", async () => {
  const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--conditions=react-server", "--import", "tsx", path.join(root, "scripts/argus-mcp.ts")],
    cwd: root,
    stderr: "pipe",
  });
  const client = new Client({ name: "argus-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const tools = new Map(result.tools.map((tool) => [tool.name, tool]));
    assert.deepEqual([...tools.keys()].sort(), [
      "apply_bulk_accounts",
      "list_provisioning_context",
      "prepare_bulk_accounts",
      "sync_openai_keys",
    ]);
    assert.equal(tools.get("list_provisioning_context")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("prepare_bulk_accounts")?.annotations?.readOnlyHint, true);
    assert.equal(tools.get("apply_bulk_accounts")?.annotations?.readOnlyHint, false);
    assert.equal(tools.get("sync_openai_keys")?.annotations?.openWorldHint, true);
    assert.ok(tools.get("prepare_bulk_accounts")?.inputSchema.required?.includes("accounts"));
    assert.ok(tools.get("apply_bulk_accounts")?.inputSchema.required?.includes("planId"));
  } finally {
    await client.close();
  }
});
