// `aig login` — device-auth flow.
//
// 1. POST /api/cli/device-auth/start → { session_code, user_code }
// 2. open https://aigateway.sh/cli/authorize?code=<user_code> in the browser
// 3. poll /api/cli/device-auth/poll until status=approved
// 4. save the returned key to ~/.config/aigateway/config.json
//
// No browser? We print the URL + code so the user can copy-paste.

import { exec } from "node:child_process";
import { platform } from "node:os";
import { loadConfig, saveConfig } from "../config.js";

const WEB = process.env.AIGATEWAY_WEB_URL ?? "https://aigateway.sh";

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${WEB}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = {} as T;
  try {
    json = (await res.json()) as T;
  } catch {
    // non-JSON body — leave json as {}
  }
  return { status: res.status, json };
}

function openInBrowser(url: string): void {
  const plat = platform();
  const cmd =
    plat === "darwin" ? `open "${url}"` : plat === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {
    // Non-fatal: the URL is printed below for copy-paste.
  });
}

interface StartResponse {
  session_code: string;
  user_code: string;
  expires_in: number;
}
interface PollResponse {
  status: "pending" | "approved" | "expired";
  key?: string;
}

export async function loginCommand(): Promise<void> {
  const start = await postJson<StartResponse>("/api/cli/device-auth/start", {});
  if (start.status !== 200 || !start.json.session_code) {
    throw new Error(`Failed to start device-auth session: ${JSON.stringify(start.json)}`);
  }

  const { session_code, user_code, expires_in } = start.json;
  const authorizeUrl = `${WEB}/cli/authorize?code=${encodeURIComponent(user_code)}`;

  process.stdout.write(
    `\n  Visit:   ${authorizeUrl}\n  Code:    ${user_code}\n  Expires: ${Math.floor(expires_in / 60)} minutes\n\n`,
  );
  openInBrowser(authorizeUrl);
  process.stdout.write("  Waiting for approval in your browser…\n");

  const deadline = Date.now() + expires_in * 1000;
  let key: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    let poll;
    try {
      poll = await postJson<PollResponse>("/api/cli/device-auth/poll", { session_code });
    } catch {
      continue; // network blip — keep polling until the deadline
    }
    if (poll.status === 404 || poll.json.status === "expired") {
      throw new Error("Session expired. Run `aig login` again.");
    }
    if (poll.json.status === "approved" && poll.json.key) {
      key = poll.json.key;
      break;
    }
  }

  if (!key) throw new Error("Timed out waiting for approval.");

  const cfg = await loadConfig();
  cfg.apiKey = key;
  await saveConfig(cfg);
  process.stdout.write(`  Signed in. Key saved to ~/.config/aigateway/config.json (prefix ${key.slice(0, 12)}…).\n`);
}
