# aigateway-cli — `aig`

Official command-line tool for [AIgateway](https://aigateway.sh) — one API key, every model, every modality. Installs the `aig` binary.

```sh
npm i -g aigateway-cli     # or: npx aigateway-cli init
aig init                   # prompts for key, writes .env, scaffolds a starter file
```

Node 18+. Zero runtime dependencies. ESM-only.

## Commands

```
aig init                          Sign in, save a key, drop it in .env, scaffold starter code
aig call <model> <prompt>         One-shot chat call (streams to stdout)
aig models [--modality <m>]       Print the live model catalog (--json for JSON output)
aig jobs video|music|3d …         Submit async generation jobs; get / cancel by id
aig mcp tools|call <name> [args]  Inspect the MCP server or invoke a tool from the shell
aig usage [--by tag|sub]          Month-to-date cost attribution
aig replay <request-id> <model>   Re-run a past request on a new model
aig eval run <dataset> <models>   Run an eval across candidate models
aig eval winner <eval-id>         Print winning model + metrics
aig sub-account create <name>     Mint a scoped key + spend cap
aig sub-account list
aig tail                          Tail live traffic (last 100 requests, then watch)
```

## Examples

```sh
# First call after `aig init`
aig call moonshot/kimi-k2.6 "explain edge inference in 50 words"

# List the catalog
aig models --modality text
aig models --json > catalog.json

# Mint a per-customer key
aig sub-account create acme-corp --cap 50000 --rpm 300 --tag acme

# Run an eval
aig eval run prompts.jsonl anthropic/claude-opus-4.7,openai/gpt-5.4,moonshot/kimi-k2.6

# Tail live traffic, filter to errors
aig tail --filter status=error

# Inspect MCP without booting an agent
aig mcp tools
aig mcp call list_models
```

## Configuration

Config lives at `~/.config/aigateway/config.json` (mode `0600`).

| Source | Wins |
|---|---|
| `AIGATEWAY_API_KEY` env var | highest |
| `~/.config/aigateway/config.json` | fallback |

```sh
# Override per call
AIGATEWAY_API_KEY=sk-aig-other aig models

# Override base URL (for self-hosted deploys)
AIGATEWAY_BASE_URL=https://aig.internal aig models
```

`aig init` is idempotent. Re-running it asks before overwriting. Pass `--key sk-aig-...` for non-interactive setup (CI):

```sh
AIGATEWAY_API_KEY=sk-aig-... aig init --no-scaffold
```

## Related packages

- **Python SDK** — [`aigateway-py`](https://pypi.org/project/aigateway-py/)
- **Node SDK** — [`aigateway-js`](https://www.npmjs.com/package/aigateway-js)
- **MCP server** — `https://api.aigateway.sh/mcp` · inspector at `/mcp/inspect`

## Source, issues, examples

- Source — [github.com/aigateway-sh/cli](https://github.com/aigateway-sh/cli)
- Issues — [github.com/aigateway-sh/cli/issues](https://github.com/aigateway-sh/cli/issues)
- Working examples — [github.com/aigateway-sh/examples](https://github.com/aigateway-sh/examples)
- Support — **support@aigateway.sh** · [aigateway.sh/support](https://aigateway.sh/support)
- Follow — [github.com/aigateway-sh](https://github.com/aigateway-sh) · [linkedin.com/in/rakeshroushan1002](https://www.linkedin.com/in/rakeshroushan1002/) · [x.com/buildwithrakesh](https://x.com/buildwithrakesh)

## License

MIT © AIgateway
