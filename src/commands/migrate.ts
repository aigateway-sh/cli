// `aig migrate <source>` — scans the current directory tree for known
// competitor SDK / env-var patterns and rewrites them in-place to point at
// AIgateway. Designed to take <= 60 seconds end-to-end:
//
//   1. detect: walk the working tree (with sensible ignores), match patterns
//   2. preview: show every change
//   3. confirm: y/N gate (skipped with --yes)
//   4. apply: rewrite each file, leave a *.aig-migrate.bak alongside (unless
//      --no-backup), then print a switch-credit CTA pointing at /switch
//
// Supports openrouter | portkey | helicone. Conservative regex: anchored to
// URLs/env names so we don't rewrite arbitrary prose.

import { existsSync, readFileSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const AIG_BASE_URL = "https://api.aigateway.sh/v1";
const AIG_ENV_VAR = "AIGATEWAY_API_KEY";
const SITE = "https://aigateway.sh";
const SWITCH_URL = `${SITE}/switch`;

interface MigrationRule {
  pattern: RegExp;
  replacement: string;
  label: string;
}
interface Source {
  slug: string;
  displayName: string;
  rules: MigrationRule[];
  notes: string[];
}

const SOURCES: Record<string, Source> = {
  openrouter: {
    slug: "openrouter",
    displayName: "OpenRouter",
    rules: [
      { label: "base URL → api.aigateway.sh/v1", pattern: /https?:\/\/openrouter\.ai\/api\/v1/g, replacement: AIG_BASE_URL },
      { label: "OPENROUTER_API_KEY → AIGATEWAY_API_KEY", pattern: /\bOPENROUTER_API_KEY\b/g, replacement: AIG_ENV_VAR },
      { label: "OPENROUTER_BASE_URL → AIGATEWAY_BASE_URL", pattern: /\bOPENROUTER_BASE_URL\b/g, replacement: "AIGATEWAY_BASE_URL" },
    ],
    notes: [
      "Model slugs are compatible (e.g. anthropic/claude-opus-4.7) — no model-name rewriting needed.",
      "OpenRouter's x-or-* headers are silently ignored; AIgateway uses x-aig-* equivalents (see docs).",
      "Streaming format is OpenAI SSE — works unchanged.",
    ],
  },
  portkey: {
    slug: "portkey",
    displayName: "Portkey",
    rules: [
      { label: "base URL → api.aigateway.sh/v1", pattern: /https?:\/\/api\.portkey\.ai\/v1/g, replacement: AIG_BASE_URL },
      { label: "PORTKEY_API_KEY → AIGATEWAY_API_KEY", pattern: /\bPORTKEY_API_KEY\b/g, replacement: AIG_ENV_VAR },
      { label: "x-portkey-api-key → Authorization: Bearer", pattern: /x-portkey-api-key/gi, replacement: "Authorization" },
    ],
    notes: [
      "Portkey's virtual keys (vk_…) need a manual swap — point them at your AIgateway sub-account key (see /sub-accounts).",
      "x-portkey-trace-id maps to x-aig-tag for cost attribution.",
      "Portkey gateway configs (retries, fallbacks) are now declared in your AIgateway routing rules.",
    ],
  },
  helicone: {
    slug: "helicone",
    displayName: "Helicone",
    rules: [
      { label: "base URL → api.aigateway.sh/v1 (was oai.helicone.ai/v1)", pattern: /https?:\/\/oai\.helicone\.ai\/v1/g, replacement: AIG_BASE_URL },
      { label: "Helicone-Auth → Authorization", pattern: /Helicone-Auth/gi, replacement: "Authorization" },
      { label: "HELICONE_API_KEY → AIGATEWAY_API_KEY", pattern: /\bHELICONE_API_KEY\b/g, replacement: AIG_ENV_VAR },
      { label: "Helicone-Property-* → x-aig-tag (manual review)", pattern: /Helicone-Property-/gi, replacement: "x-aig-tag-" },
    ],
    notes: [
      "Helicone observability headers map 1:1 to AIgateway's usage log — no separate observability provider needed.",
      "If you used Helicone's caching layer, AIgateway's edge cache is on by default with a 50% discount on hits.",
      "Property tags (Helicone-Property-Feature) become cost-attribution tags via x-aig-tag.",
    ],
  },
};

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", ".turbo", ".vercel", ".wrangler",
  "dist", "build", "out", "coverage", ".pnpm-store", ".venv", "venv", "__pycache__", ".cache",
]);
const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".swift", ".php", ".sh", ".yaml", ".yml", ".toml", ".json", ".md", ".mdx", ".env",
]);

interface FileChange {
  path: string;
  hits: { rule: MigrationRule; count: number }[];
  originalContent: string;
  newContent: string;
}

function walkFiles(root: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env" && !entry.name.startsWith(".env.")) {
      if (entry.isDirectory()) continue;
      if (entry.isFile() && !entry.name.startsWith(".env")) continue;
    }
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkFiles(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".aig-migrate.bak")) continue;
    const ext = extname(entry.name);
    if (ext && !TEXT_EXTS.has(ext)) continue;
    if (!ext && !entry.name.startsWith(".env")) continue;
    try {
      if (statSync(full).size > 1024 * 1024) continue;
    } catch {
      continue;
    }
    out.push(full);
  }
  return out;
}

function scanFile(path: string, source: Source): FileChange | null {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const hits: { rule: MigrationRule; count: number }[] = [];
  let newContent = content;
  for (const rule of source.rules) {
    const matches = content.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    hits.push({ rule, count: matches.length });
    newContent = newContent.replace(rule.pattern, rule.replacement);
  }
  if (hits.length === 0) return null;
  return { path, hits, originalContent: content, newContent };
}

function printPreview(changes: FileChange[], root: string): void {
  process.stdout.write(`\nFound ${changes.length} file${changes.length === 1 ? "" : "s"} with rewrites:\n\n`);
  for (const change of changes) {
    const rel = relative(root, change.path) || change.path;
    process.stdout.write(`  ${rel}\n`);
    for (const hit of change.hits) {
      process.stdout.write(`    ${hit.count}× ${hit.rule.label}\n`);
    }
  }
  process.stdout.write("\n");
}

async function confirm(prompt: string): Promise<boolean> {
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      const answer = String(data).trim().toLowerCase();
      resolve(answer === "y" || answer === "yes");
    });
  });
}

function applyChanges(changes: FileChange[], opts: { backup: boolean }): void {
  for (const change of changes) {
    if (opts.backup) {
      try {
        writeFileSync(`${change.path}.aig-migrate.bak`, change.originalContent, "utf8");
      } catch (e) {
        process.stderr.write(`warn: backup failed for ${change.path}: ${(e as Error).message}\n`);
      }
    }
    writeFileSync(change.path, change.newContent, "utf8");
  }
}

function listSources(): string {
  return Object.values(SOURCES).map((s) => s.slug).join(" | ");
}

function printSourceHelp(): void {
  process.stdout.write(
    [
      "aig migrate — swap a competitor's SDK config for AIgateway.",
      "",
      "Usage:",
      "  aig migrate <source> [path]",
      "",
      `Sources: ${listSources()}`,
      "",
      "Flags:",
      "  --yes, -y         Skip the confirmation prompt (CI-friendly).",
      "  --no-backup       Don't write *.aig-migrate.bak alongside each rewritten file.",
      "  --dry-run         Print what would change, then exit 0 without writing anything.",
      "",
      "Examples:",
      "  aig migrate openrouter           # scan ./ for OpenRouter SDK config",
      "  aig migrate portkey ./apps/api   # scan a subdirectory",
      "  aig migrate helicone --dry-run   # preview only",
      "",
      `Switch credit: after migrating, claim a credit match at ${SWITCH_URL}.`,
      "",
    ].join("\n"),
  );
}

export async function migrateCommand(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printSourceHelp();
    return;
  }

  const sourceSlug = argv[0]!.toLowerCase();
  const source = SOURCES[sourceSlug];
  if (!source) {
    throw new Error(
      `Unknown source: ${sourceSlug}. Available: ${listSources()}. ` +
        `Want one we don't have? File an issue at https://github.com/aigateway-sh/cli/issues.`,
    );
  }

  let yes = false;
  let backup = true;
  let dryRun = false;
  let root = process.cwd();
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--yes" || a === "-y") yes = true;
    else if (a === "--no-backup") backup = false;
    else if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    else root = a;
  }

  if (!existsSync(root)) throw new Error(`Path does not exist: ${root}`);

  process.stdout.write(`Migrating from ${source.displayName} in ${root}…\n`);
  const files = walkFiles(root);
  const changes: FileChange[] = [];
  for (const path of files) {
    const change = scanFile(path, source);
    if (change) changes.push(change);
  }

  if (changes.length === 0) {
    process.stdout.write(`No ${source.displayName} config patterns found. Nothing to do.\n`);
    process.stdout.write(`If you expected matches, check the search root: ${root}\n`);
    return;
  }

  printPreview(changes, root);

  if (dryRun) {
    process.stdout.write("(dry-run — no files written)\n");
    return;
  }

  if (!yes) {
    const ok = await confirm(`Apply these rewrites? [y/N] `);
    if (!ok) {
      process.stdout.write("Aborted. No files changed.\n");
      process.exitCode = 1;
      return;
    }
  }

  applyChanges(changes, { backup });

  process.stdout.write(`\nDone. Rewrote ${changes.length} file${changes.length === 1 ? "" : "s"}.\n`);
  if (backup) process.stdout.write(`Backups: *.aig-migrate.bak (delete once you're confident).\n`);

  process.stdout.write(`\nNext steps:\n`);
  process.stdout.write(`  1. Set AIGATEWAY_API_KEY in your env (run \`aig login\` if you don't have one).\n`);
  process.stdout.write(`  2. Run your test suite — the SDK swap should be transparent.\n`);
  process.stdout.write(`  3. Claim your switch credit: ${SWITCH_URL}\n`);
  if (source.notes.length > 0) {
    process.stdout.write(`\nNotes for ${source.displayName} migrations:\n`);
    for (const note of source.notes) process.stdout.write(`  · ${note}\n`);
  }
  process.stdout.write(`\nDocs: ${SITE}/docs/migrate/${source.slug}\n`);
}
