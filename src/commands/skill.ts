// `aig skill install` — drop the canonical AIgateway agent skill into a
// harness skills directory. The skill is regenerated from the live catalog,
// so re-running this refreshes it.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const WEB = process.env.AIGATEWAY_WEB_URL ?? "https://aigateway.sh";
const SKILL_URL = `${WEB}/skill.md`;

const HELP = `aig skill — install the AIgateway agent skill.

Usage:
  aig skill install [--dir <path>]   # download SKILL.md into a harness skills dir

Default dir: ~/.claude/skills/aigateway
`;

export async function skillCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (!sub || sub === "-h" || sub === "--help") {
    process.stdout.write(HELP);
    return;
  }
  if (sub !== "install") throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);

  const dirIdx = rest.indexOf("--dir");
  const dir = dirIdx >= 0 && rest[dirIdx + 1] ? rest[dirIdx + 1]! : join(homedir(), ".claude", "skills", "aigateway");

  const res = await fetch(SKILL_URL, { headers: { Accept: "text/markdown" } });
  if (!res.ok) throw new Error(`Failed to fetch ${SKILL_URL}: HTTP ${res.status}`);
  const body = await res.text();

  await mkdir(dir, { recursive: true });
  const target = join(dir, "SKILL.md");
  await writeFile(target, body);
  process.stdout.write(`Installed AIgateway skill → ${target}\nRestart your agent (Claude Code: /reload-plugins) to pick it up.\n`);
}
