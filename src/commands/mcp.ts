import { loadConfig } from "../config.js";

const HELP = `aig mcp — inspect the MCP server.

Usage:
  aig mcp tools                  # list available tools
  aig mcp call <tool> <json>     # invoke a tool with JSON arguments
`;

export async function mcpCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return;
  }
  const cfg = await loadConfig();
  const base = (cfg.baseUrl ?? process.env.AIGATEWAY_BASE_URL ?? "https://api.aigateway.sh").replace(/\/+$/, "");
  const key = cfg.apiKey ?? process.env.AIGATEWAY_API_KEY;
  if (!key) throw new Error("no key — run `aig init` first");

  async function rpc(method: string, params?: unknown): Promise<unknown> {
    const resp = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const body = await resp.json() as any;
    if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
    return body.result;
  }

  switch (sub) {
    case "tools": {
      const out = await rpc("tools/list") as { tools: Array<{ name: string; description: string }> };
      for (const t of out.tools) {
        process.stdout.write(`${t.name.padEnd(20)}  ${t.description}\n`);
      }
      return;
    }
    case "call": {
      const [tool, argsJson] = rest;
      if (!tool) throw new Error("usage: aig mcp call <tool> '<json-args>'");
      let parsed: Record<string, unknown> = {};
      if (argsJson) {
        try { parsed = JSON.parse(argsJson); }
        catch { throw new Error("arguments must be valid JSON"); }
      }
      const result = await rpc("tools/call", { name: tool, arguments: parsed });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    default:
      throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  }
}
