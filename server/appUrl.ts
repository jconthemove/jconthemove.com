const FALLBACK_APP_URL = "https://jconthemove.com";

export function getAppUrl(): string {
  const configuredUrl =
    process.env.APP_URL?.trim()
    || process.env.RENDER_EXTERNAL_URL?.trim()
    || FALLBACK_APP_URL;

  return configuredUrl.replace(/\/+$/, "");
}
