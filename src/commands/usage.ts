import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

export async function usageCommand(args: string[]): Promise<void> {
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  const byIdx = args.indexOf("--by");
  const by = byIdx >= 0 ? args[byIdx + 1] : "tag";
  const path = by === "sub" ? "/v1/usage/by-sub-account" : "/v1/usage/by-tag";

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const rows = (await res.json()) as { data: { label: string; cost_cents: number; requests: number }[] };

  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(`${pad("key", 32)}  ${pad("requests", 10)}  cost (USD)\n`);
  for (const r of rows.data) {
    process.stdout.write(`${pad(r.label, 32)}  ${pad(String(r.requests), 10)}  $${(r.cost_cents / 100).toFixed(4)}\n`);
  }
}
