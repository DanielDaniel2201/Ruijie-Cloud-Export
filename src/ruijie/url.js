const RUIJIE_HOST = /^cloud(?:-[a-z0-9]+)?\.ruijienetworks\.com$/i;

export function parseRuijieProjectUrl(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error("url is required: paste the Ruijie Cloud project page copied from Chrome.");
  }
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    throw new Error("url must be a valid absolute HTTPS Ruijie Cloud project URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("url must use https.");
  if (!RUIJIE_HOST.test(parsed.hostname)) {
    throw new Error(`url host is not a Ruijie Cloud site: ${parsed.hostname}`);
  }
  return parsed;
}
