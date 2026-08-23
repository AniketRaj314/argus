import "server-only";
import packageJson from "../../package.json";
import { ensureSchema, getDb, getRuntimeEnv } from "../../db";

export const ARGUS_VERSION = packageJson.version;

export type HealthSnapshot = {
  status: "operational" | "degraded";
  version: string;
  checkedAt: string;
  responseTimeMs: number;
  environment: "production" | "development" | "test";
  deployment: "railway" | "vercel" | "standalone";
  revision: string | null;
  checks: {
    application: "operational";
    database: "connected" | "unavailable";
    usageSource: "openai" | "demo" | "not-configured";
  };
};

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const startedAt = Date.now();
  let database: HealthSnapshot["checks"]["database"] = "unavailable";
  try {
    await ensureSchema();
    await getDb().prepare("SELECT 1 AS ok").first<{ ok: number }>();
    database = "connected";
  } catch {
    console.error("ARGUS health database check failed.");
  }

  const env = getRuntimeEnv();
  const usageSource = env.ARGUS_DEMO_MODE === "true"
    ? "demo"
    : env.OPENAI_ADMIN_KEY ? "openai" : "not-configured";
  const environment = process.env.NODE_ENV === "production"
    ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";
  const deployment = process.env.RAILWAY_ENVIRONMENT
    ? "railway" : process.env.VERCEL ? "vercel" : "standalone";
  const revision = (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 8) || null;

  return {
    status: database === "connected" ? "operational" : "degraded",
    version: ARGUS_VERSION,
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    environment,
    deployment,
    revision,
    checks: { application: "operational", database, usageSource },
  };
}
