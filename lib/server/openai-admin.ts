import "server-only";

import { getRuntimeEnv } from "../../db";
import { ApiError } from "./security";

type OpenAIList<T> = {
  data?: T[];
  has_more?: boolean;
  last_id?: string | null;
};

type OpenAIProject = {
  id: string;
  name: string;
  status: "active" | "archived";
};

type OpenAIProjectKey = {
  id: string;
  name?: string | null;
  created_at?: number;
  last_used_at?: number | null;
};

export type DiscoveredOpenAIKey = {
  keyId: string;
  label: string;
  projectId: string;
  createdAt: number | null;
};

async function listAll<T>(path: string, adminKey: string, params: Record<string, string> = {}): Promise<T[]> {
  const items: T[] = [];
  let after: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`https://api.openai.com/v1/${path}`);
    url.searchParams.set("limit", "100");
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    if (after) url.searchParams.set("after", after);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch {
      throw new ApiError(502, "OpenAI key discovery could not be reached. Try syncing again.", "OPENAI_UNAVAILABLE");
    }

    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? "OpenAI rejected key discovery. Verify that the server credential is an organization Admin key."
        : "OpenAI key discovery is temporarily unavailable. Try syncing again.";
      throw new ApiError(502, message, "OPENAI_KEY_DISCOVERY_FAILED");
    }

    const payload = await response.json() as OpenAIList<T>;
    if (!Array.isArray(payload.data)) {
      throw new ApiError(502, "OpenAI returned an unexpected key-discovery response.", "OPENAI_INVALID_RESPONSE");
    }
    items.push(...payload.data);
    if (!payload.has_more) return items;
    if (!payload.last_id) {
      throw new ApiError(502, "OpenAI key discovery could not continue pagination.", "OPENAI_INVALID_RESPONSE");
    }
    after = payload.last_id;
  }

  throw new ApiError(502, "OpenAI key discovery exceeded the safe pagination limit.", "OPENAI_PAGINATION_LIMIT");
}

export async function discoverOpenAIProjectKeys(): Promise<{ projects: number; keys: DiscoveredOpenAIKey[] }> {
  const adminKey = getRuntimeEnv().OPENAI_ADMIN_KEY;
  if (!adminKey) {
    throw new ApiError(503, "Configure the server OpenAI Admin key before syncing.", "OPENAI_NOT_CONFIGURED");
  }

  const projects = await listAll<OpenAIProject>("organization/projects", adminKey);
  const keys: DiscoveredOpenAIKey[] = [];

  for (const project of projects.filter((item) => item.status === "active")) {
    const projectKeys = await listAll<OpenAIProjectKey>(
      `organization/projects/${encodeURIComponent(project.id)}/api_keys`,
      adminKey,
    );
    for (const key of projectKeys) {
      // Intentionally keep only identifiers and labels. The upstream redacted_value
      // and owner records are never returned from this server-only boundary.
      keys.push({
        keyId: key.id,
        label: key.name?.trim().slice(0, 80) || `${project.name.slice(0, 68)} API key`,
        projectId: project.id,
        createdAt: Number.isFinite(key.created_at) ? key.created_at ?? null : null,
      });
    }
  }

  return { projects: projects.filter((item) => item.status === "active").length, keys };
}
