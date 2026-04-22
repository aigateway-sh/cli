import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

export async function subAccountCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  if (sub === "create") {
    const [name] = rest;
    const capIdx = rest.indexOf("--cap-cents");
    const tagIdx = rest.indexOf("--tag");
    const refIdx = rest.indexOf("--ref");
    if (!name) throw new Error("Usage: aig sub-account create <name> [--cap-cents N] [--tag t] [--ref external-ref]");
    const res = await fetch(`${baseUrl}/v1/sub-accounts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        spend_cap_cents: capIdx >= 0 ? Number(rest[capIdx + 1]) : undefined,
        default_tag: tagIdx >= 0 ? rest[tagIdx + 1] : undefined,
        external_ref: refIdx >= 0 ? rest[refIdx + 1] : undefined,
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    const r = (await res.json()) as { id: string; scoped_key?: string };
    process.stdout.write(`created ${r.id}\n`);
    if (r.scoped_key) {
      process.stdout.write(`\nscoped key (shown once — save it now):\n  ${r.scoped_key}\n\n`);
    }
    return;
  }

  if (sub === "list" || !sub) {
    const res = await fetch(`${baseUrl}/v1/sub-accounts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    const data = (await res.json()) as { data: { id: string; name: string; spend_cap_cents?: number }[] };
    for (const s of data.data) {
      const cap = s.spend_cap_cents ? `$${(s.spend_cap_cents / 100).toFixed(2)} cap` : "no cap";
      process.stdout.write(`${s.id}  ${s.name.padEnd(32)}  ${cap}\n`);
    }
    return;
  }

  throw new Error("Usage: aig sub-account <create|list>");
}
