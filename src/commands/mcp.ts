import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

const HELP = `aig mcp — inspect and install the AIgateway MCP server.

Usage:
  aig mcp tools                      # list available tools
  aig mcp call <tool> '<json>'       # invoke a tool with JSON arguments
  aig mcp config [--client <c>]      # print the MCP config snippet (no writes)
  aig mcp install [--client <c>]     # wire the MCP server into a client

Clients: claude-code | cursor | windsurf | cline (default: print snippets for all)
`;

type Client = "claude-code" | "cursor" | "windsurf" | "cline";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  return eq?.split("=").slice(1).join("=");
}

async function mergeJsonConfig(path: string, server: Record<string, unknown>): Promise<void> {
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(await readFile(path, "utf8"));
  } catch {
    // new or unreadable file — start fresh
  }
  json.mcpServers = json.mcpServers ?? {};
  json.mcpServers.aigateway = server;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(json, null, 2) + "\n");
}

function snippet(url: string, key: string, urlField: "url" | "serverUrl"): string {
  return JSON.stringify(
    { mcpServers: { aigateway: { [urlField]: url, headers: { Authorization: `Bearer ${key}` } } } },
    null,
    2,
  );
}

export async function mcpCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return;
  }

  const cfg = await loadConfig();
  const base = resolveBaseUrl(cfg).replace(/\/+$/, "");
  const mcpUrl = `${base}/mcp`;

  if (sub === "tools" || sub === "call") {
    const key = resolveApiKey(cfg);
    const rpc = async (method: string, params?: unknown): Promise<any> => {
      const resp = await fetch(mcpUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const body = (await resp.json()) as any;
      if (body.error) throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
      return body.result;
    };

    if (sub === "tools") {
      const out = (await rpc("tools/list")) as { tools: Array<{ name: string; description: string }> };
      for (const t of out.tools) process.stdout.write(`${t.name.padEnd(20)}  ${t.description}\n`);
      return;
    }
    const [tool, argsJson] = rest;
    if (!tool) throw new Error("usage: aig mcp call <tool> '<json-args>'");
    let parsed: Record<string, unknown> = {};
    if (argsJson) {
      try {
        parsed = JSON.parse(argsJson);
      } catch {
        throw new Error("arguments must be valid JSON");
      }
    }
    const result = await rpc("tools/call", { name: tool, arguments: parsed });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (sub === "config" || sub === "install") {
    const client = flag(rest, "client") as Client | undefined;
    const writing = sub === "install";
    // `config` without a saved key still prints a copy-pasteable snippet.
    const key = writing ? resolveApiKey(cfg) : cfg.apiKey ?? process.env.AIGATEWAY_API_KEY ?? "sk-aig-...";

    if (!client) {
      process.stdout.write(`Claude Code:\n  claude mcp add --transport http aigateway ${mcpUrl} \\\n    --header "Authorization: Bearer ${key}"\n\n`);
      process.stdout.write(`Cursor (~/.cursor/mcp.json):\n${snippet(mcpUrl, key, "url")}\n\n`);
      process.stdout.write(`Windsurf (~/.codeium/windsurf/mcp_config.json):\n${snippet(mcpUrl, key, "serverUrl")}\n\n`);
      process.stdout.write(`Cline (VS Code → Cline → MCP Servers):\n${snippet(mcpUrl, key, "url")}\n`);
      return;
    }

    if (client === "claude-code") {
      const cmd = `claude mcp add --transport http aigateway ${mcpUrl} --header "Authorization: Bearer ${key}"`;
      if (!writing) {
        process.stdout.write(`${cmd}\n`);
        return;
      }
      const r = spawnSync("claude", ["mcp", "add", "--transport", "http", "aigateway", mcpUrl, "--header", `Authorization: Bearer ${key}`], { stdio: "inherit" });
      if (r.error || r.status !== 0) {
        process.stdout.write(`\nCould not run \`claude\` directly. Run this yourself:\n  ${cmd}\n`);
      } else {
        process.stdout.write("\nAdded the aigateway MCP server to Claude Code.\n");
      }
      return;
    }

    if (client === "cline") {
      process.stdout.write(`Cline stores MCP servers in your VS Code settings, not a fixed file.\nOpen Cline → MCP Servers → Configure and paste:\n\n${snippet(mcpUrl, key, "url")}\n`);
      return;
    }

    const targets: Record<"cursor" | "windsurf", { path: string; urlField: "url" | "serverUrl" }> = {
      cursor: { path: join(homedir(), ".cursor", "mcp.json"), urlField: "url" },
      windsurf: { path: join(homedir(), ".codeium", "windsurf", "mcp_config.json"), urlField: "serverUrl" },
    };
    const t = targets[client as "cursor" | "windsurf"];
    if (!t) throw new Error(`Unknown client: ${client}. Use claude-code | cursor | windsurf | cline.`);
    if (!writing) {
      process.stdout.write(`${t.path}:\n${snippet(mcpUrl, key, t.urlField)}\n`);
      return;
    }
    await mergeJsonConfig(t.path, { [t.urlField]: mcpUrl, headers: { Authorization: `Bearer ${key}` } });
    process.stdout.write(`Wrote aigateway MCP server to ${t.path}. Restart ${client} to pick it up.\n`);
    return;
  }

  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
