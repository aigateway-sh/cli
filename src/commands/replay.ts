import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

export async function replayCommand(args: string[]): Promise<void> {
  const [requestId, model] = args;
  if (!requestId || !model) {
    throw new Error("Usage: aig replay <request-id> <target-model>");
  }
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  const res = await fetch(`${baseUrl}/v1/replays`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source_request_id: requestId, target_model: model }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const r = (await res.json()) as {
    id: string;
    source_cost_cents: number;
    target_cost_cents: number;
    source_latency_ms: number;
    target_latency_ms: number;
    score_delta: number;
  };
  process.stdout.write(
    [
      `replay ${r.id}`,
      `  cost    source $${(r.source_cost_cents / 100).toFixed(4)}   target $${(r.target_cost_cents / 100).toFixed(4)}   Δ $${((r.target_cost_cents - r.source_cost_cents) / 100).toFixed(4)}`,
      `  latency source ${r.source_latency_ms}ms   target ${r.target_latency_ms}ms`,
      `  output similarity: ${(r.score_delta * 100).toFixed(1)}%`,
      "",
    ].join("\n"),
  );
}
