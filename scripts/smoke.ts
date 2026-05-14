import "dotenv/config";

const baseUrl =
  process.env.BRIDGE_BASE_URL ??
  `http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? "9992"}`;
const bridgeApiKey = process.env.BRIDGE_API_KEY;
const acceptUpstreamErrors = process.env.SMOKE_ACCEPT_UPSTREAM_ERRORS === "1";
const expectedToken = "COMMANDCODE_BRIDGE_SMOKE_OK";

const headers = {
  "Content-Type": "application/json",
  ...(bridgeApiKey ? { Authorization: `Bearer ${bridgeApiKey}` } : {}),
};

async function readJsonResponse(response: Response): Promise<{ text: string; json: unknown }> {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) as unknown };
  } catch {
    return { text, json: undefined };
  }
}

function errorCode(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null || !("error" in json)) return undefined;
  const error = (json as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const health = await fetch(`${baseUrl}/health`);
const healthBody = await readJsonResponse(health);
console.log("HEALTH", health.status, health.statusText);
console.log(healthBody.text);
if (!health.ok) process.exit(1);

const response = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "default",
    messages: [{ role: "user", content: `Reply exactly: ${expectedToken}` }],
    // CommandCode reasoning models can spend dozens of hidden tokens before visible text.
    // Keep this high enough that smoke does not fail with an empty `finish_reason: length` response.
    max_tokens: 128,
    temperature: 0,
  }),
});

const body = await readJsonResponse(response);
console.log("CHAT", response.status, response.statusText);
console.log(body.text);

if (response.ok && body.text.includes(expectedToken)) {
  console.log("SMOKE_CONTENT_OK");
  process.exit(0);
}

const code = errorCode(body.json);
if (
  acceptUpstreamErrors &&
  response.status === 502 &&
  (code === "commandcode_event_error" ||
    code === "commandcode_empty_response" ||
    code === "commandcode_empty_visible_response")
) {
  console.log(`SMOKE_UPSTREAM_FAILURE_SURFACED_OK code=${code}`);
  process.exit(0);
}

console.error(
  acceptUpstreamErrors
    ? "Smoke failed: expected content success or explicit upstream failure."
    : "Smoke failed: expected content success. Set SMOKE_ACCEPT_UPSTREAM_ERRORS=1 to accept explicit upstream account/stream failures for routing-only smoke.",
);
process.exit(1);
