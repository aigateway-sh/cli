import { createInterface } from "node:readline/promises";
import { writeFile, access, readFile, stat } from "node:fs/promises";
import { loadConfig, saveConfig } from "../config.js";

type Lang = "ts" | "js" | "py" | "unknown";

export async function initCommand(args: string[]): Promise<void> {
  const nonInteractive = args.includes("--key") || !!process.env.AIGATEWAY_API_KEY;
  let key: string | undefined;

  const keyFlagIdx = args.indexOf("--key");
  if (keyFlagIdx >= 0) key = args[keyFlagIdx + 1];
  if (!key) key = process.env.AIGATEWAY_API_KEY;

  if (!key && !nonInteractive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(
      [
        "",
        "  AIgateway — one API, every model.",
        "",
        "  1. Open https://aigateway.sh/signin",
        "  2. Copy your key (starts with sk-aig-)",
        "",
      ].join("\n"),
    );
    key = (await rl.question("  Paste key: ")).trim();
    rl.close();
  }

  if (!key) throw new Error("No key provided. Pass --key <sk-aig-...> or set AIGATEWAY_API_KEY.");
  if (!key.startsWith("sk-aig-")) {
    throw new Error("That doesn't look like an AIgateway key (should start with sk-aig-).");
  }

  const cfg = await loadConfig();
  cfg.apiKey = key;
  await saveConfig(cfg);

  // .env scaffold.
  try {
    await access(".env");
    const existing = await readFile(".env", "utf8");
    if (!existing.includes("AIGATEWAY_API_KEY")) {
      await writeFile(".env", existing + `\nAIGATEWAY_API_KEY=${key}\n`);
      process.stdout.write("  added AIGATEWAY_API_KEY to .env\n");
    }
  } catch {
    await writeFile(".env", `AIGATEWAY_API_KEY=${key}\n`);
    process.stdout.write("  created .env\n");
  }

  const lang = await detectLang();
  if (!args.includes("--no-scaffold")) {
    await scaffold(lang);
  }

  process.stdout.write([
    "",
    "  Next steps:",
    "    1. " + runCommandFor(lang),
    "    2. Explore models:  aig models --modality text",
    "    3. Try MCP in-browser: https://api.aigateway.sh/mcp/inspect",
    "",
  ].join("\n"));
}

async function detectLang(): Promise<Lang> {
  const has = async (p: string) => !!(await stat(p).catch(() => null));
  if (await has("package.json")) {
    try {
      const pkg = JSON.parse(await readFile("package.json", "utf8"));
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if ("typescript" in deps || await has("tsconfig.json")) return "ts";
      return "js";
    } catch {
      return "js";
    }
  }
  if (await has("pyproject.toml") || await has("requirements.txt") || await has("setup.py")) return "py";
  return "unknown";
}

function runCommandFor(lang: Lang): string {
  switch (lang) {
    case "ts": return "Scaffolded aigateway-quickstart.ts — run: npx tsx aigateway-quickstart.ts";
    case "js": return "Scaffolded aigateway-quickstart.js — run: node aigateway-quickstart.js";
    case "py": return "Scaffolded aigateway_quickstart.py — run: python aigateway_quickstart.py";
    default:   return "Pick a language: `aig init --ts`, `--js`, or `--py` re-runs with that template.";
  }
}

async function scaffold(lang: Lang): Promise<void> {
  const NODE_JS = `// aigateway-quickstart.js — drop-in for the OpenAI client.
// Install: npm install openai aigateway
import OpenAI from "openai";
import { AIgateway, verifyWebhook } from "aigateway";

// 1. Chat / embeddings / images → the OpenAI SDK with our base URL.
const openai = new OpenAI({
  apiKey: process.env.AIGATEWAY_API_KEY,
  baseURL: "https://api.aigateway.sh/v1",
});

const r = await openai.chat.completions.create({
  model: "anthropic/claude-opus-4.7",
  messages: [{ role: "user", content: "Hello in 6 words." }],
});
console.log(r.choices[0].message.content);

// 2. Async jobs (video/music/3D) → the aigateway SDK.
const ai = new AIgateway({ apiKey: process.env.AIGATEWAY_API_KEY });
const job = await ai.jobs.createVideo({
  prompt: "a cozy reading corner, golden hour",
  model: "runwayml/gen-4",
  duration: 5,
});
const done = await ai.jobs.wait(job.id);
console.log("video:", done.result_url);
`;
  const NODE_TS = `// aigateway-quickstart.ts — drop-in for the OpenAI client.
// Install: npm install openai aigateway
import OpenAI from "openai";
import { AIgateway } from "aigateway";

const openai = new OpenAI({
  apiKey: process.env.AIGATEWAY_API_KEY!,
  baseURL: "https://api.aigateway.sh/v1",
});

async function main() {
  const r = await openai.chat.completions.create({
    model: "anthropic/claude-opus-4.7",
    messages: [{ role: "user", content: "Hello in 6 words." }],
  });
  console.log(r.choices[0]?.message.content);

  const ai = new AIgateway({ apiKey: process.env.AIGATEWAY_API_KEY! });
  const job = await ai.jobs.createVideo({
    prompt: "a cozy reading corner, golden hour",
    model: "runwayml/gen-4",
    duration: 5,
  });
  const done = await ai.jobs.wait(job.id);
  console.log("video:", done.result_url);
}

main().catch(console.error);
`;
  const PY = `# aigateway_quickstart.py — drop-in for the OpenAI client.
# Install: pip install openai aigateway
import os
from openai import OpenAI
from aigateway import AIgateway

openai = OpenAI(
    api_key=os.environ["AIGATEWAY_API_KEY"],
    base_url="https://api.aigateway.sh/v1",
)

r = openai.chat.completions.create(
    model="anthropic/claude-opus-4.7",
    messages=[{"role": "user", "content": "Hello in 6 words."}],
)
print(r.choices[0].message.content)

ai = AIgateway(api_key=os.environ["AIGATEWAY_API_KEY"])
job = ai.jobs.create_video(
    prompt="a cozy reading corner, golden hour",
    model="runwayml/gen-4",
    duration=5,
)
done = ai.jobs.wait(job.id)
print("video:", done.result_url)
`;

  if (lang === "ts") await writeIfMissing("aigateway-quickstart.ts", NODE_TS);
  else if (lang === "js") await writeIfMissing("aigateway-quickstart.js", NODE_JS);
  else if (lang === "py") await writeIfMissing("aigateway_quickstart.py", PY);
}

async function writeIfMissing(path: string, body: string): Promise<void> {
  try {
    await access(path);
    process.stdout.write(`  ${path} already exists — leaving it alone\n`);
  } catch {
    await writeFile(path, body);
    process.stdout.write(`  wrote ${path}\n`);
  }
}
