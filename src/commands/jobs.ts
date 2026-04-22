import { loadConfig } from "../config.js";

const HELP = `aig jobs — submit + poll async generations.

Usage:
  aig jobs video --prompt "a cat on a skateboard" [--model runwayml/gen-4] [--duration 5] [--wait]
  aig jobs music --prompt "lo-fi morning" [--wait]
  aig jobs 3d    --prompt "a chair" [--wait]
  aig jobs get   <job-id>
  aig jobs cancel <job-id>
`;

export async function jobsCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return;
  }
  const cfg = await loadConfig();
  const base = (cfg.baseUrl ?? process.env.AIGATEWAY_BASE_URL ?? "https://api.aigateway.sh").replace(/\/+$/, "");
  const key = cfg.apiKey ?? process.env.AIGATEWAY_API_KEY;
  if (!key) throw new Error("no key — run `aig init` first");

  const authHeaders = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  switch (sub) {
    case "video":
    case "music":
    case "3d": {
      const path =
        sub === "video" ? "/v1/videos/generations" :
        sub === "music" ? "/v1/audio/music" :
        "/v1/3d/generations";
      const body: Record<string, unknown> = {};
      for (let i = 0; i < rest.length; i += 2) {
        const flag = rest[i];
        const val = rest[i + 1];
        if (!flag?.startsWith("--")) continue;
        const k = flag.slice(2);
        if (k === "wait") { i -= 1; continue; }
        if (!val) continue;
        body[k] = /^\d+$/.test(val) ? Number(val) : val;
      }
      const resp = await fetch(`${base}${path}`, { method: "POST", headers: authHeaders, body: JSON.stringify(body) });
      const job = await resp.json() as any;
      if (!resp.ok) throw new Error(job?.error?.message ?? `HTTP ${resp.status}`);
      process.stdout.write(JSON.stringify(job, null, 2) + "\n");

      if (rest.includes("--wait")) {
        await waitForJob(base, key, job.id);
      }
      return;
    }
    case "get": {
      const id = rest[0];
      if (!id) throw new Error("usage: aig jobs get <job-id>");
      const resp = await fetch(`${base}/v1/jobs/${encodeURIComponent(id)}`, { headers: authHeaders });
      process.stdout.write(JSON.stringify(await resp.json(), null, 2) + "\n");
      return;
    }
    case "cancel": {
      const id = rest[0];
      if (!id) throw new Error("usage: aig jobs cancel <job-id>");
      const resp = await fetch(`${base}/v1/jobs/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders });
      process.stdout.write(JSON.stringify(await resp.json(), null, 2) + "\n");
      return;
    }
    default:
      throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  }
}

async function waitForJob(base: string, key: string, id: string): Promise<void> {
  let delay = 2000;
  const start = Date.now();
  process.stderr.write(`waiting for ${id} ...\n`);
  while (Date.now() - start < 10 * 60_000) {
    const resp = await fetch(`${base}/v1/jobs/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const job = await resp.json() as any;
    if (job.status === "completed" || job.status === "failed") {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n");
      return;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 30_000);
  }
  throw new Error("timed out after 10 minutes");
}
