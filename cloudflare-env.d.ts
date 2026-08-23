declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    OPENAI_ADMIN_KEY?: string;
    ARGUS_SETUP_TOKEN?: string;
    ARGUS_PASSWORD_PEPPER?: string;
    ARGUS_DEMO_MODE?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
