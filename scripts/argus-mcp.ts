import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bulkProvisioningEntrySchema } from "../lib/bulk-provisioning";
import {
  applyBulkProvisioning,
  BulkProvisioningError,
  getBulkProvisioningContext,
  prepareBulkProvisioning,
  syncProvisioningKeys,
} from "../lib/server/bulk-provisioning";

const server = new McpServer(
  { name: "argus-admin", version: "1.3.0" },
  {
    instructions: "For bulk onboarding, sync OpenAI keys first, list the current context, prepare a bulk plan, show the full preview, and obtain explicit user confirmation before applying it. Never request a password in tool input: apply reads the shared temporary password from ARGUS_BULK_DEFAULT_PASSWORD. Never infer email addresses, limits, or ambiguous key matches.",
  },
);

server.registerTool(
  "sync_openai_keys",
  {
    title: "Sync OpenAI keys into ARGUS",
    description: "Refresh tracked API Key IDs and labels from the OpenAI organization before matching a roster. Uses the server-only OpenAI Admin credential and never returns it.",
    inputSchema: {},
    outputSchema: {
      projects: z.number().int(),
      discovered: z.number().int(),
      created: z.number().int(),
      restored: z.number().int(),
      unchanged: z.number().int(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async () => {
    try {
      const result = await syncProvisioningKeys();
      return textResult(`Synced ${result.discovered} OpenAI keys across ${result.projects} projects.`, result);
    } catch (error) {
      return toolError(error);
    }
  },
);

const issueSchema = z.object({ code: z.string(), message: z.string() });
const planRowSchema = z.object({
  row: z.number().int(),
  email: z.string(),
  displayName: z.string(),
  keyQuery: z.string(),
  matchedKeyLabel: z.string().nullable(),
  creditLimitCents: z.number().int().nullable(),
  issues: z.array(issueSchema),
});

function textResult<T extends Record<string, unknown>>(message: string, data: T) {
  return { content: [{ type: "text" as const, text: message }], structuredContent: data };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : "ARGUS could not complete the operation.";
  const code = error instanceof BulkProvisioningError ? error.code : "INTERNAL_ERROR";
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${code}: ${message}` }],
  };
}

server.registerTool(
  "list_provisioning_context",
  {
    title: "List ARGUS provisioning context",
    description: "List active tracked key labels and existing ARGUS accounts before preparing a bulk account roster. Key IDs are masked and no credentials are returned.",
    inputSchema: {},
    outputSchema: {
      keys: z.array(z.object({ id: z.string(), keyId: z.string(), label: z.string() })),
      accounts: z.array(z.object({
        id: z.string(), email: z.string(), displayName: z.string(), creditLimitCents: z.number().int().nullable(),
      })),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    try {
      const context = await getBulkProvisioningContext();
      return textResult(`Found ${context.keys.length} active keys and ${context.accounts.length} existing accounts.`, context);
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "prepare_bulk_accounts",
  {
    title: "Preview bulk ARGUS accounts",
    description: "Validate a roster and exactly match each person to an active tracked key by label or Key ID. This is a read-only preview and creates nothing. Omit displayName to use the matched OpenAI key label.",
    inputSchema: { accounts: z.array(bulkProvisioningEntrySchema).min(1).max(100) },
    outputSchema: {
      ready: z.boolean(),
      planId: z.string().nullable(),
      expiresAt: z.number().int().nullable(),
      createCount: z.number().int(),
      issueCount: z.number().int(),
      rows: z.array(planRowSchema),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ accounts }) => {
    try {
      const plan = await prepareBulkProvisioning(accounts);
      const message = plan.ready
        ? `Plan ${plan.planId} is ready to create ${plan.createCount} accounts. It expires in 10 minutes. Show the complete preview and ask for explicit confirmation before applying it.`
        : `The roster has ${plan.issueCount} issues. Nothing was created.`;
      return textResult(message, plan);
    } catch (error) {
      return toolError(error);
    }
  },
);

server.registerTool(
  "apply_bulk_accounts",
  {
    title: "Create bulk ARGUS accounts",
    description: "Apply a previously prepared provisioning plan after the user explicitly confirms the complete preview. Creates all accounts, assigns one matched key per account, sets lifetime credit limits, and writes audit records atomically.",
    inputSchema: { planId: z.string().min(16).max(128) },
    outputSchema: {
      createdCount: z.number().int(),
      created: z.array(z.object({
        id: z.string(), email: z.string(), displayName: z.string(), keyLabel: z.string(), creditLimitCents: z.number().int().nullable(),
      })),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ planId }) => {
    try {
      const result = await applyBulkProvisioning(planId);
      return textResult(`Created and assigned ${result.createdCount} ARGUS accounts. The shared temporary password was not returned or logged.`, result);
    } catch (error) {
      return toolError(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
