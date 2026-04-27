/**
 * PII Proxy — standalone Express server.
 *
 * Sits between Hawkeye runtime (cloud) and customer's allowed LLM providers.
 * Runs in customer's VPC.
 *
 * Endpoint: POST /llm/:provider/chat
 *   Body: { messages, model, temperature, ... }  (provider-native shape)
 *   Auth: Bearer <PII_PROXY_HAWKEYE_API_KEY>
 *   Response: provider-native, with tokens un-redacted
 *
 * Audit log: every redaction event written as JSONL to PII_PROXY_AUDIT_LOG_PATH.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { redactMessages, unredactText } from "./redactor.js";
import { getTokenStore } from "./tokenStore.js";

const PORT = parseInt(process.env.PII_PROXY_LISTEN_PORT || "8443", 10);
const SHARED_KEY = process.env.PII_PROXY_HAWKEYE_API_KEY || "dev-only-shared-key-change-me";
const ALLOWED_PROVIDERS = (process.env.PII_PROXY_LLM_PROVIDERS || "anthropic,gemini").split(",").map((s) => s.trim());
const AUDIT_LOG_PATH = process.env.PII_PROXY_AUDIT_LOG_PATH || "./audit.jsonl";

fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });

function writeAudit(event) {
  const line = JSON.stringify({ ...event, ts: new Date().toISOString() }) + "\n";
  fs.appendFile(AUDIT_LOG_PATH, line, () => {});
}

const PROVIDER_URLS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  openai: "https://api.openai.com/v1/chat/completions",
};

const app = express();
app.use(express.json({ limit: "5mb" }));

// Auth gate — Hawkeye runtime must authenticate
app.use((req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== SHARED_KEY) return res.status(401).json({ error: "invalid_proxy_key" });
  next();
});

app.post("/llm/:provider/chat", async (req, res) => {
  const { provider } = req.params;
  if (!ALLOWED_PROVIDERS.includes(provider)) return res.status(400).json({ error: "provider_not_allowed", provider });
  if (!PROVIDER_URLS[provider]) return res.status(400).json({ error: "unknown_provider" });

  const messages = req.body.messages || [];
  const { redactedMessages, replacements, totalHits } = redactMessages(messages);

  // Persist token map (so the un-redact path can resolve tokens — useful when caller comes back later)
  const store = getTokenStore();
  await store.setMany([...replacements.entries()]);

  writeAudit({
    event: "redaction",
    provider,
    requestPath: req.path,
    messagesCount: messages.length,
    redactionsApplied: totalHits,
    redactedTokens: [...replacements.keys()],
  });

  // ── Call upstream provider ──
  // (For MVP, we just forward the body with redacted messages. In production,
  // you'd switch on provider for the right wire format.)
  let upstreamResponse;
  try {
    const fetch = (await import("node-fetch")).default;
    const upstreamUrl = PROVIDER_URLS[provider];
    upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Customer's LLM credentials live in this VPC — Hawkeye never sees them.
        "x-api-key": process.env[`${provider.toUpperCase()}_API_KEY`] || "",
      },
      body: JSON.stringify({ ...req.body, messages: redactedMessages }),
    });
  } catch (err) {
    writeAudit({ event: "upstream_error", provider, error: err.message });
    return res.status(502).json({ error: "upstream_failed", message: err.message });
  }

  const responseJson = await upstreamResponse.json().catch(() => ({}));

  // ── Un-redact response ──
  // Provider responses have varying shapes; here's the un-redact for a generic chat completion.
  const unredact = (s) => unredactText(s, replacements);
  if (responseJson.content && Array.isArray(responseJson.content)) {
    responseJson.content = responseJson.content.map((c) => ({ ...c, text: unredact(c.text) }));
  } else if (responseJson.choices) {
    responseJson.choices = responseJson.choices.map((c) => ({
      ...c,
      message: c.message ? { ...c.message, content: unredact(c.message.content) } : c.message,
    }));
  } else if (responseJson.candidates) {
    // Gemini shape
    responseJson.candidates = responseJson.candidates.map((c) => ({
      ...c,
      content: c.content ? { ...c.content, parts: (c.content.parts || []).map((p) => ({ ...p, text: unredact(p.text) })) } : c.content,
    }));
  }

  return res.status(upstreamResponse.status).json(responseJson);
});

app.get("/healthz", (req, res) => res.json({ ok: true, version: "0.1.0" }));

app.listen(PORT, () => {
  console.log(`PII Proxy listening on :${PORT} · allowed providers: ${ALLOWED_PROVIDERS.join(", ")}`);
});
