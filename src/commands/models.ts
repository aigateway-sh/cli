import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

interface ModelRow {
  id: string;
  object?: string;
  modality?: string;
  owned_by?: string;
}

export async function modelsCommand(args: string[]): Promise<void> {
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  const modalityIdx = args.indexOf("--modality");
  const modality = modalityIdx >= 0 ? args[modalityIdx + 1] : undefined;

  const res = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const data = (await res.json()) as { data: ModelRow[] };
  const rows = modality ? data.data.filter((m) => m.modality === modality) : data.data;

  for (const m of rows) {
    const tag = m.modality ? ` [${m.modality}]` : "";
    process.stdout.write(`${m.id}${tag}\n`);
  }
  process.stderr.write(`\n${rows.length} models${modality ? ` · modality=${modality}` : ""}\n`);
}
