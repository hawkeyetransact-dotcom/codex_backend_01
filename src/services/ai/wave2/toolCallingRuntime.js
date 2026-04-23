/**
 * Tool-Calling Runtime — Wave 2 implementation.
 *
 * Typed tool registry with read/write taxonomy. Write-side tools MUST
 * require an e-signature ticket before execution. The runtime enforces it.
 *
 * Tools register themselves at boot (see registerCoreTools below for the
 * initial built-in set). Custom tenant tools can register via the same API.
 *
 * NOTE: A full e-signature ticket system exists in the electronicSignature
 * infrastructure. For Wave 2 we accept a pre-validated ticket id on the
 * ctx; verifying the ticket integrates with the existing signature chain
 * in a later iteration.
 */
import { recordAiDecision } from "../audit/aiAuditTrail.js";

const REGISTRY = new Map();

export class ToolNotFoundError extends Error { constructor(n) { super(`Tool not found: ${n}`); this.code = "TOOL_NOT_FOUND"; } }
export class ToolInputInvalidError extends Error { constructor(n, issues) { super(`Invalid input for ${n}: ${JSON.stringify(issues).slice(0,200)}`); this.code = "TOOL_INPUT_INVALID"; this.issues = issues; } }
export class ToolForbiddenError extends Error { constructor(n, role) { super(`Role '${role}' may not invoke ${n}`); this.code = "TOOL_FORBIDDEN"; } }
export class ESigRequiredError extends Error { constructor(n) { super(`Tool ${n} requires e-signature to execute`); this.code = "ESIG_REQUIRED"; } }

/**
 * Minimal JSON-schema-ish validator. Supports type, required, enum, items.
 * Full JSON-schema validation (AJV) is a later upgrade.
 */
function validateAgainst(schema, value) {
  const issues = [];
  const check = (v, s, path) => {
    if (!s) return;
    if (s.required && (v === undefined || v === null)) issues.push(`${path}: required`);
    if (v === undefined || v === null) return;
    if (s.type === "string" && typeof v !== "string") issues.push(`${path}: expected string`);
    if (s.type === "number" && typeof v !== "number") issues.push(`${path}: expected number`);
    if (s.type === "boolean" && typeof v !== "boolean") issues.push(`${path}: expected boolean`);
    if (s.type === "array" && !Array.isArray(v)) issues.push(`${path}: expected array`);
    if (s.type === "object" && (typeof v !== "object" || Array.isArray(v))) issues.push(`${path}: expected object`);
    if (Array.isArray(s.enum) && !s.enum.includes(v)) issues.push(`${path}: expected one of ${s.enum.join(",")}`);
    if (s.type === "object" && s.properties) {
      for (const [k, sub] of Object.entries(s.properties)) check(v[k], sub, `${path}.${k}`);
    }
    if (s.type === "array" && s.items && Array.isArray(v)) {
      v.forEach((x, i) => check(x, s.items, `${path}[${i}]`));
    }
  };
  check(value, schema, "$");
  return issues;
}

export function registerTool(toolDef) {
  const required = ["name", "description", "handler", "sideEffect"];
  for (const k of required) {
    if (!toolDef[k]) throw new Error(`registerTool: missing '${k}' field`);
  }
  if (!["none", "write"].includes(toolDef.sideEffect)) {
    throw new Error(`registerTool: sideEffect must be 'none' or 'write'`);
  }
  if (REGISTRY.has(toolDef.name)) {
    throw new Error(`registerTool: duplicate name '${toolDef.name}'`);
  }
  REGISTRY.set(toolDef.name, {
    ...toolDef,
    requiresESig: toolDef.sideEffect === "write" ? (toolDef.requiresESig !== false) : false,
    allowedRoles: Array.isArray(toolDef.allowedRoles) && toolDef.allowedRoles.length ? toolDef.allowedRoles : ["admin", "tenant_admin", "superadmin"],
  });
  return true;
}

export function listTools({ role, sideEffect } = {}) {
  const items = [];
  for (const def of REGISTRY.values()) {
    if (sideEffect && def.sideEffect !== sideEffect) continue;
    if (role && !def.allowedRoles.includes(role)) continue;
    items.push({
      name: def.name,
      description: def.description,
      sideEffect: def.sideEffect,
      requiresESig: def.requiresESig,
      inputSchema: def.inputSchema || null,
      outputSchema: def.outputSchema || null,
    });
  }
  return items;
}

export async function invokeTool(name, input, ctx = {}) {
  const def = REGISTRY.get(name);
  if (!def) throw new ToolNotFoundError(name);
  const role = ctx.user?.role || ctx.role;
  if (role && !def.allowedRoles.includes(role)) throw new ToolForbiddenError(name, role);

  if (def.inputSchema) {
    const issues = validateAgainst(def.inputSchema, input);
    if (issues.length) throw new ToolInputInvalidError(name, issues);
  }

  if (def.sideEffect === "write" && def.requiresESig) {
    if (!ctx.eSigTicket && !ctx.approvedByESig) throw new ESigRequiredError(name);
  }

  const startedAt = Date.now();
  let output;
  let failure;
  try {
    output = await def.handler(input, ctx);
    if (def.outputSchema) {
      const issues = validateAgainst(def.outputSchema, output);
      if (issues.length) {
        failure = `output_schema_mismatch: ${JSON.stringify(issues).slice(0, 200)}`;
      }
    }
  } catch (err) {
    failure = err?.message || String(err);
    throw err;
  } finally {
    // Audit trail entry for every invocation regardless of success.
    recordAiDecision({
      tenantId: ctx.tenantId,
      auditId: ctx.auditId,
      actorId: ctx.user?._id || ctx.userId,
      actorRole: role,
      feature: `tool.${name}`,
      linkedEntityType: ctx.linkedEntityType,
      linkedEntityId: ctx.linkedEntityId,
      input,
      output: failure ? { error: failure } : output,
      confidence: null,
      grounded: true,
      provider: "tool-runtime",
      model: name,
      modelVersion: `${name}@${def.version || "1.0.0"}`,
      promptHash: null,
      promptVersion: def.version || "1.0.0",
      tokensInput: 0,
      tokensOutput: 0,
      latencyMs: Date.now() - startedAt,
      toolCalls: [{ name, input, failure }],
    }).catch((e) => console.error("[toolRuntime] audit failed", e.message));
  }
  return output;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Built-in core tools — read-only, safe to register at boot.
// Write-side tools should be registered by their owning module's controller
// at app startup so dependencies are clean.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register a minimal set of safe, read-only tools that every agent can use.
 * Owning modules can extend later.
 */
export function registerCoreTools({ AuditRequestMaster, Capa, Deviation } = {}) {
  const registered = [];

  if (AuditRequestMaster) {
    registerTool({
      name: "audits.summary",
      description: "Return a short summary of the most recent audits for the tenant.",
      sideEffect: "none",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } },
      outputSchema: { type: "object" },
      handler: async (input, ctx) => {
        const limit = Math.min(Math.max(Number(input?.limit) || 5, 1), 25);
        const docs = await AuditRequestMaster.find({ tenantId: ctx.tenantId })
          .sort({ createdAt: -1 }).limit(limit)
          .select("_id internalRequestId trackStatus supplierDecision auditorDecision createdAt").lean();
        return { count: docs.length, audits: docs };
      },
    });
    registered.push("audits.summary");
  }

  if (Capa) {
    registerTool({
      name: "capas.open_list",
      description: "List the tenant's open CAPAs (status != CLOSED) with owner + severity.",
      sideEffect: "none",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } },
      handler: async (input, ctx) => {
        const limit = Math.min(Math.max(Number(input?.limit) || 20, 1), 100);
        const docs = await Capa.find({ tenantId: ctx.tenantId, status: { $ne: "CLOSED" } })
          .sort({ createdAt: -1 }).limit(limit)
          .select("_id capaNumber status severity ownerUserId dueDate").lean();
        return { count: docs.length, capas: docs };
      },
    });
    registered.push("capas.open_list");
  }

  if (Deviation) {
    registerTool({
      name: "deviations.recent",
      description: "List recent deviations for the tenant.",
      sideEffect: "none",
      inputSchema: { type: "object", properties: { days: { type: "number" } } },
      handler: async (input, ctx) => {
        const days = Math.min(Math.max(Number(input?.days) || 30, 1), 365);
        const since = new Date(Date.now() - days * 86400000);
        const docs = await Deviation.find({ tenantId: ctx.tenantId, createdAt: { $gte: since } })
          .sort({ createdAt: -1 }).limit(100)
          .select("_id deviationNumber status title batchDisposition createdAt").lean();
        return { count: docs.length, deviations: docs, sinceDate: since.toISOString() };
      },
    });
    registered.push("deviations.recent");
  }

  return registered;
}

export function __clearRegistryForTests() { REGISTRY.clear(); }
export function __registryForTests() { return REGISTRY; }
