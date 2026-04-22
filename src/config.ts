import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "aigateway");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface Config {
  apiKey?: string;
  baseUrl?: string;
  org?: string;
}

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export function resolveApiKey(cfg: Config): string {
  const envKey = process.env.AIGATEWAY_API_KEY;
  if (envKey) return envKey;
  if (cfg.apiKey) return cfg.apiKey;
  throw new Error("No API key. Run `aig init` or set AIGATEWAY_API_KEY.");
}

export function resolveBaseUrl(cfg: Config): string {
  return process.env.AIGATEWAY_BASE_URL ?? cfg.baseUrl ?? "https://api.aigateway.sh";
}
