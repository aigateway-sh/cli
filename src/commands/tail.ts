import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

export async function tailCommand(_args: string[]): Promise<void> {
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  const res = await fetch(`${baseUrl}/v1/usage/recent?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const data = (await res.json()) as {
    data: {
      request_id: string;
      model: string;
      status: number;
      latency_ms: number;
      cost_cents: number;
      tag?: string;
      created_at: string;
    }[];
  };
  for (const r of data.data) {
    const ts = r.created_at.replace("T", " ").slice(0, 19);
    const cost = `$${(r.cost_cents / 100).toFixed(4)}`.padStart(10);
    const tag = r.tag ? ` ${r.tag}` : "";
    process.stdout.write(`${ts}  ${String(r.status).padStart(3)}  ${String(r.latency_ms).padStart(5)}ms  ${cost}  ${r.model}${tag}\n`);
  }
}
