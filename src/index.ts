import { initCommand } from "./commands/init.js";
import { callCommand } from "./commands/call.js";
import { modelsCommand } from "./commands/models.js";
import { usageCommand } from "./commands/usage.js";
import { replayCommand } from "./commands/replay.js";
import { evalCommand } from "./commands/eval.js";
import { subAccountCommand } from "./commands/sub-account.js";
import { tailCommand } from "./commands/tail.js";
import { jobsCommand } from "./commands/jobs.js";
import { mcpCommand } from "./commands/mcp.js";

const HELP = `AIgateway CLI — one API, every model.

Usage: aig <command> [options]

Commands:
  init                    Sign in, save a key, drop it in .env, scaffold starter code
  call <model> <prompt>   One-shot chat call (streams to stdout)
  models [--modality ..]  Print the live model catalog
  jobs video|music|3d …   Submit async generation jobs; get / cancel by id
  mcp tools|call …        Inspect the MCP server or invoke a tool from the shell
  usage [--by tag|sub]    Month-to-date cost attribution
  replay <request-id> <model>   Re-run a past request on a new model
  eval run <dataset> <models>   Run an eval across candidate models
  eval winner <eval-id>         Print winning model + metrics
  sub-account create <name>     Mint a scoped key + spend cap
  sub-account list
  tail                    Tail live traffic (last 100 requests)

Environment:
  AIGATEWAY_API_KEY       Your org key (write with: aig init)
  AIGATEWAY_BASE_URL      Override base URL (default: https://api.aigateway.sh)

Docs: https://aigateway.sh/reference
`;

export async function run(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }
  switch (cmd) {
    case "init":
      return initCommand(rest);
    case "call":
      return callCommand(rest);
    case "models":
      return modelsCommand(rest);
    case "usage":
      return usageCommand(rest);
    case "replay":
      return replayCommand(rest);
    case "eval":
      return evalCommand(rest);
    case "sub-account":
    case "sub-accounts":
      return subAccountCommand(rest);
    case "tail":
      return tailCommand(rest);
    case "jobs":
    case "job":
      return jobsCommand(rest);
    case "mcp":
      return mcpCommand(rest);
    default:
      process.stderr.write(`unknown command: ${cmd}\n\n${HELP}`);
      process.exit(1);
  }
}
