import { readFile } from "node:fs/promises";
import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

export async function evalCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "run") return runEval(rest);
  if (sub === "winner") return showWinner(rest);
  throw new Error("Usage: aig eval run <dataset.jsonl> <modelA,modelB,...>  |  aig eval winner <eval-id>");
}

async function runEval(args: string[]): Promise<void> {
  const [datasetPath, modelList, metricRaw] = args;
  if (!datasetPath || !modelList) {
    throw new Error("Usage: aig eval run <dataset.jsonl> <modelA,modelB,...> [--metric quality|cost|speed]");
  }
  const metricIdx = args.indexOf("--metric");
  const metric = (metricIdx >= 0 ? args[metricIdx + 1] : metricRaw) ?? "quality";

  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  const raw = await readFile(datasetPath, "utf8");
  const dataset = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { input: string; expected?: string });

  const res = await fetch(`${baseUrl}/v1/evals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      candidate_models: modelList.split(",").map((s) => s.trim()),
      dataset,
      metric,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const r = (await res.json()) as { id: string; winner_model: string };
  process.stdout.write(`eval ${r.id} winner: ${r.winner_model}\n`);
  process.stdout.write(`route to winner with: model: "eval:${r.id}"\n`);
}

async function showWinner(args: string[]): Promise<void> {
  const [id] = args;
  if (!id) throw new Error("Usage: aig eval winner <eval-id>");
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);
  const res = await fetch(`${baseUrl}/v1/evals/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  process.stdout.write((await res.text()) + "\n");
}
