export function normalizeAppOrigin(value?: string): string | null {
  const configured = value?.trim();
  if (!configured) return null;

  const url = new URL(configured);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("ARGUS_APP_ORIGIN must be an HTTP(S) origin without a path, query, or credentials.");
  }
  return url.origin;
}

export function externalRequestOrigin(request: Request, configuredOrigin?: string): string {
  return normalizeAppOrigin(configuredOrigin) ?? new URL(request.url).origin;
}
