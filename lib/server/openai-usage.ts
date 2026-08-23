import "server-only";
import { getRuntimeEnv } from "../../db";
import { ApiError } from "./security";

export type DashboardRange = 7 | 30 | "all";
type TrackedKey = { id: string; keyId: string; label: string; projectId: string | null; createdAt: number };
type UsageResult = Record<string, unknown> & { api_key_id?: string | null; model?: string | null };
type Bucket = { start_time: number; end_time: number; results: UsageResult[] };
type UsagePage = { data?: Bucket[]; has_more?: boolean; next_page?: string | null };

export type DashboardData = {
  source: "openai" | "demo" | "empty";
  generatedAt: number;
  range: DashboardRange;
  rangeDays: number;
  rangeStart: number;
  granularity: "day" | "month";
  summary: {
    totalSpend: number;
    previousSpend: number | null;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    requests: number;
    activeKeys: number;
  };
  daily: Array<{ timestamp: number; label: string; spend: number; inputTokens: number; outputTokens: number; requests: number }>;
  models: Array<{ name: string; inputTokens: number; outputTokens: number; requests: number; totalTokens: number }>;
  keys: Array<{ id: string; keyId: string; label: string; spend: number; tokens: number; requests: number; lastActiveAt: number | null }>;
  services: Array<{ name: string; requests: number }>;
  recent: Array<{ id: string; timestamp: number; keyLabel: string; model: string; tokens: number; requests: number; spend: number }>;
  notices: string[];
};

const usageEndpoints = [
  { path: "completions", model: true, service: "Completions" },
  { path: "embeddings", model: true, service: "Embeddings" },
  { path: "images", model: true, service: "Images" },
  { path: "audio_speeches", model: true, service: "Speech" },
  { path: "audio_transcriptions", model: true, service: "Transcription" },
  { path: "moderations", model: true, service: "Moderation" },
  { path: "file_search_calls", model: false, service: "File search" },
  { path: "web_search_calls", model: true, service: "Web search" },
] as const;

function appendList(params: URLSearchParams, name: string, values: string[]) {
  for (const value of values) params.append(name, value);
}

async function fetchAll(path: string, params: URLSearchParams, adminKey: string): Promise<Bucket[]> {
  const data: Bucket[] = [];
  let page: string | null = null;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const query = new URLSearchParams(params);
    if (page) query.set("page", page);
    const response = await fetch(`https://api.openai.com/v1/organization/${path}?${query}`, {
      headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`OpenAI ${path} returned ${response.status}`);
    const payload = await response.json() as UsagePage;
    data.push(...(payload.data ?? []));
    page = payload.has_more ? payload.next_page ?? null : null;
    if (!page) break;
  }
  return data;
}

function numeric(result: UsageResult, ...fields: string[]): number {
  return fields.reduce((sum, field) => sum + (typeof result[field] === "number" ? result[field] as number : 0), 0);
}

function requestCount(result: UsageResult): number {
  return numeric(result, "num_model_requests", "num_requests", "num_sessions", "images");
}

function dayLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(timestamp * 1000);
}

function monthLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(timestamp * 1000);
}

function periodStart(timestamp: number, granularity: DashboardData["granularity"]): number {
  if (granularity === "day") return Math.floor(timestamp / 86_400) * 86_400;
  const date = new Date(timestamp * 1000);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
}

export async function getSpendByKey(keys: TrackedKey[], start: number, end: number): Promise<Map<string, number>> {
  const spend = new Map(keys.map((key) => [key.keyId, 0]));
  if (!keys.length) return spend;
  if (getRuntimeEnv().ARGUS_DEMO_MODE === "true") {
    const days = Math.max(1, Math.ceil((end - start) / 86_400));
    const denominator = keys.length * (keys.length + 1) / 2;
    keys.forEach((key, index) => spend.set(key.keyId, days * 9.4 * ((keys.length - index) / denominator)));
    return spend;
  }
  const adminKey = getRuntimeEnv().OPENAI_ADMIN_KEY;
  if (!adminKey) throw new ApiError(503, "OpenAI data is not connected yet.", "OPENAI_NOT_CONFIGURED");
  const params = new URLSearchParams({
    start_time: String(start), end_time: String(end), bucket_width: "1d",
    limit: String(Math.min(Math.max(1, Math.ceil((end - start) / 86_400)) + 1, 180)),
  });
  appendList(params, "api_key_ids", keys.map((key) => key.keyId));
  params.append("group_by", "api_key_id");
  const buckets = await fetchAll("costs", params, adminKey);
  for (const result of buckets.flatMap((bucket) => bucket.results)) {
    if (!result.api_key_id || !spend.has(result.api_key_id)) continue;
    const amount = typeof result.amount === "object" && result.amount && typeof (result.amount as { value?: unknown }).value === "number"
      ? (result.amount as { value: number }).value : 0;
    spend.set(result.api_key_id, (spend.get(result.api_key_id) ?? 0) + amount);
  }
  return spend;
}

export async function getDashboardData(keys: TrackedKey[], range: DashboardRange): Promise<DashboardData> {
  if (keys.length === 0) return emptyDashboard(range);
  if (getRuntimeEnv().ARGUS_DEMO_MODE === "true") return demoDashboard(keys, range);
  const adminKey = getRuntimeEnv().OPENAI_ADMIN_KEY;
  if (!adminKey) throw new ApiError(503, "OpenAI data is not connected yet. Ask the root user to configure the server Admin key.", "OPENAI_NOT_CONFIGURED");

  const now = Math.floor(Date.now() / 1000);
  const earliestKey = Math.min(...keys.map((key) => key.createdAt));
  const start = range === "all" ? periodStart(earliestKey, "day") : now - range * 86_400;
  const rangeDays = Math.max(1, Math.ceil((now - start) / 86_400));
  const previousStart = range === "all" ? null : start - range * 86_400;
  const granularity: DashboardData["granularity"] = range === "all" && rangeDays > 120 ? "month" : "day";
  const keyIds = keys.map((key) => key.keyId);
  const usageRequests = usageEndpoints.map(async (endpoint) => {
    const params = new URLSearchParams({ start_time: String(start), end_time: String(now), bucket_width: "1d", limit: "31" });
    appendList(params, "api_key_ids", keyIds);
    params.append("group_by", "api_key_id");
    if (endpoint.model) params.append("group_by", "model");
    return { endpoint, buckets: await fetchAll(`usage/${endpoint.path}`, params, adminKey) };
  });
  const costParams = new URLSearchParams({ start_time: String(start), end_time: String(now), bucket_width: "1d", limit: String(Math.min(rangeDays + 1, 180)) });
  appendList(costParams, "api_key_ids", keyIds);
  costParams.append("group_by", "api_key_id");
  costParams.append("group_by", "line_item");
  const previousCosts = previousStart === null ? Promise.resolve([]) : (() => {
    const params = new URLSearchParams({ start_time: String(previousStart), end_time: String(start), bucket_width: "1d", limit: String(Math.min(rangeDays + 1, 180)) });
    appendList(params, "api_key_ids", keyIds);
    return fetchAll("costs", params, adminKey);
  })();
  const [usageSettled, costSettled] = await Promise.all([
    Promise.allSettled(usageRequests),
    Promise.allSettled([fetchAll("costs", costParams, adminKey), previousCosts]),
  ]);
  const usage = usageSettled
    .filter((item): item is PromiseFulfilledResult<{ endpoint: typeof usageEndpoints[number]; buckets: Bucket[] }> => item.status === "fulfilled")
    .map((item) => item.value);
  const [costsResult, previousCostsResult] = costSettled;
  if (usage.length === 0 && costsResult.status === "rejected") {
    throw new ApiError(502, "OpenAI usage data could not be loaded. Verify the server Admin key and organization access.", "OPENAI_UNAVAILABLE");
  }
  const notices = [...usageSettled, ...costSettled].filter((item) => item.status === "rejected").length
    ? ["Some OpenAI usage categories were temporarily unavailable; available totals are shown."]
    : [];
  return aggregate(
    keys,
    range,
    rangeDays,
    start,
    granularity,
    usage,
    costsResult.status === "fulfilled" ? costsResult.value : [],
    previousCostsResult.status === "fulfilled" ? previousCostsResult.value : [],
    notices,
  );
}

function aggregate(
  keys: TrackedKey[],
  range: DashboardRange,
  rangeDays: number,
  start: number,
  granularity: DashboardData["granularity"],
  usage: Array<{ endpoint: typeof usageEndpoints[number]; buckets: Bucket[] }>,
  costBuckets: Bucket[],
  previousCostBuckets: Bucket[],
  notices: string[],
): DashboardData {
  const now = Math.floor(Date.now() / 1000);
  const days = new Map<number, DashboardData["daily"][number]>();
  if (granularity === "day") {
    for (let offset = rangeDays - 1; offset >= 0; offset -= 1) {
      const timestamp = Math.floor((now - offset * 86_400) / 86_400) * 86_400;
      days.set(timestamp, { timestamp, label: dayLabel(timestamp), spend: 0, inputTokens: 0, outputTokens: 0, requests: 0 });
    }
  } else {
    const cursor = new Date(periodStart(start, "month") * 1000);
    while (cursor.getTime() <= now * 1000) {
      const timestamp = cursor.getTime() / 1000;
      days.set(timestamp, { timestamp, label: monthLabel(timestamp), spend: 0, inputTokens: 0, outputTokens: 0, requests: 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  const keyMap = new Map(keys.map((key) => [key.keyId, { id: key.id, keyId: key.keyId, label: key.label, spend: 0, tokens: 0, requests: 0, lastActiveAt: null as number | null }]));
  const modelMap = new Map<string, DashboardData["models"][number]>();
  const serviceMap = new Map<string, number>();
  const recentMap = new Map<string, DashboardData["recent"][number]>();
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let requests = 0;

  for (const group of usage) {
    for (const bucket of group.buckets) {
      const day = days.get(periodStart(bucket.start_time, granularity));
      for (const result of bucket.results) {
        const input = numeric(result, "input_tokens");
        const output = numeric(result, "output_tokens");
        const cached = numeric(result, "input_cached_tokens");
        const count = requestCount(result);
        inputTokens += input;
        outputTokens += output;
        cachedTokens += cached;
        requests += count;
        if (day) {
          day.inputTokens += input;
          day.outputTokens += output;
          day.requests += count;
        }
        serviceMap.set(group.endpoint.service, (serviceMap.get(group.endpoint.service) ?? 0) + count);
        const key = result.api_key_id ? keyMap.get(result.api_key_id) : undefined;
        if (key) {
          key.tokens += input + output;
          key.requests += count;
          if (count > 0 || input + output > 0) key.lastActiveAt = Math.max(key.lastActiveAt ?? 0, bucket.end_time);
        }
        const modelName = result.model || group.endpoint.service;
        const model = modelMap.get(modelName) ?? { name: modelName, inputTokens: 0, outputTokens: 0, requests: 0, totalTokens: 0 };
        model.inputTokens += input;
        model.outputTokens += output;
        model.totalTokens += input + output;
        model.requests += count;
        modelMap.set(modelName, model);
        if (key && (count > 0 || input + output > 0)) {
          const id = `${bucket.start_time}:${key.id}:${modelName}`;
          recentMap.set(id, { id, timestamp: bucket.end_time, keyLabel: key.label, model: modelName, tokens: input + output, requests: count, spend: 0 });
        }
      }
    }
  }

  let totalSpend = 0;
  for (const bucket of costBuckets) {
    const day = days.get(periodStart(bucket.start_time, granularity));
    for (const result of bucket.results) {
      const amount = typeof result.amount === "object" && result.amount && typeof (result.amount as { value?: unknown }).value === "number"
        ? (result.amount as { value: number }).value : 0;
      totalSpend += amount;
      if (day) day.spend += amount;
      const key = result.api_key_id ? keyMap.get(result.api_key_id) : undefined;
      if (key) key.spend += amount;
    }
  }
  const previousSpend = range === "all" ? null : previousCostBuckets.flatMap((bucket) => bucket.results).reduce((sum, result) => {
    const value = typeof result.amount === "object" && result.amount && typeof (result.amount as { value?: unknown }).value === "number"
      ? (result.amount as { value: number }).value : 0;
    return sum + value;
  }, 0);
  const sortedRecent = [...recentMap.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
  for (const item of sortedRecent) {
    const key = [...keyMap.values()].find((candidate) => candidate.label === item.keyLabel);
    if (key && key.requests > 0) item.spend = key.spend * (item.requests / key.requests);
  }
  return {
    source: "openai",
    generatedAt: now,
    range,
    rangeDays,
    rangeStart: start,
    granularity,
    summary: { totalSpend, previousSpend, inputTokens, outputTokens, cachedTokens, requests, activeKeys: [...keyMap.values()].filter((key) => key.lastActiveAt).length },
    daily: [...days.values()],
    models: [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 8),
    keys: [...keyMap.values()].sort((a, b) => b.spend - a.spend),
    services: [...serviceMap.entries()].map(([name, count]) => ({ name, requests: count })).sort((a, b) => b.requests - a.requests),
    recent: sortedRecent,
    notices,
  };
}

function emptyDashboard(range: DashboardRange): DashboardData {
  const now = Math.floor(Date.now() / 1000);
  const rangeDays = range === "all" ? 0 : range;
  return {
    source: "empty", generatedAt: now, range, rangeDays, rangeStart: now, granularity: "day",
    summary: { totalSpend: 0, previousSpend: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, requests: 0, activeKeys: 0 },
    daily: [], models: [], keys: [], services: [], recent: [], notices: [],
  };
}

function demoDashboard(keys: TrackedKey[], range: DashboardRange): DashboardData {
  const now = Math.floor(Date.now() / 1000);
  const rangeDays = range === "all" ? 365 : range;
  const daily = Array.from({ length: rangeDays }, (_, index) => {
    const timestamp = Math.floor((now - (rangeDays - index - 1) * 86_400) / 86_400) * 86_400;
    const wave = 1 + Math.sin(index * 0.74) * 0.32 + (index % 6 === 0 ? 0.72 : 0);
    return { timestamp, label: dayLabel(timestamp), spend: Number((9.4 * wave).toFixed(2)), inputTokens: Math.round(384_000 * wave), outputTokens: Math.round(96_000 * wave), requests: Math.round(282 * wave) };
  });
  const totals = daily.reduce((sum, day) => ({ spend: sum.spend + day.spend, input: sum.input + day.inputTokens, output: sum.output + day.outputTokens, requests: sum.requests + day.requests }), { spend: 0, input: 0, output: 0, requests: 0 });
  const models = [
    { name: "gpt-5.6", share: 0.48 }, { name: "gpt-5-mini", share: 0.27 },
    { name: "gpt-4.1", share: 0.16 }, { name: "text-embedding-3-small", share: 0.09 },
  ].map((model) => ({ name: model.name, inputTokens: Math.round(totals.input * model.share), outputTokens: Math.round(totals.output * model.share), totalTokens: Math.round((totals.input + totals.output) * model.share), requests: Math.round(totals.requests * model.share) }));
  const dashboardKeys = keys.map((key, index) => {
    const share = (keys.length - index) / (keys.length * (keys.length + 1) / 2);
    return { id: key.id, keyId: key.keyId, label: key.label, spend: totals.spend * share, tokens: Math.round((totals.input + totals.output) * share), requests: Math.round(totals.requests * share), lastActiveAt: now - index * 1_900 };
  });
  const recent = Array.from({ length: 10 }, (_, index) => {
    const key = dashboardKeys[index % dashboardKeys.length];
    const model = models[index % models.length];
    return { id: `demo_${index}`, timestamp: now - index * 4_200, keyLabel: key.label, model: model.name, tokens: 12_400 + index * 1_740, requests: 9 + index * 3, spend: Number((0.84 + index * 0.27).toFixed(2)) };
  });
  return {
    source: "demo", generatedAt: now, range, rangeDays, rangeStart: now - rangeDays * 86_400, granularity: "day",
    summary: { totalSpend: totals.spend, previousSpend: totals.spend * 0.86, inputTokens: totals.input, outputTokens: totals.output, cachedTokens: Math.round(totals.input * 0.31), requests: totals.requests, activeKeys: keys.length },
    daily, models, keys: dashboardKeys, services: [
      { name: "Completions", requests: Math.round(totals.requests * 0.68) },
      { name: "Embeddings", requests: Math.round(totals.requests * 0.17) },
      { name: "Web search", requests: Math.round(totals.requests * 0.1) },
      { name: "Images", requests: Math.round(totals.requests * 0.05) },
    ], recent, notices: ["Demo data is active. Connect the server Admin key to load live OpenAI usage."],
  };
}
