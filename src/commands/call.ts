import { loadConfig, resolveApiKey, resolveBaseUrl } from "../config.js";

export async function callCommand(args: string[]): Promise<void> {
  const [model, ...promptParts] = args;
  if (!model || promptParts.length === 0) {
    throw new Error('Usage: aig call <model> "<prompt>"');
  }
  const prompt = promptParts.join(" ");
  const cfg = await loadConfig();
  const apiKey = resolveApiKey(cfg);
  const baseUrl = resolveBaseUrl(cfg);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") {
        process.stdout.write("\n");
        return;
      }
      try {
        const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) process.stdout.write(delta);
      } catch {
      }
    }
  }
  process.stdout.write("\n");
}
