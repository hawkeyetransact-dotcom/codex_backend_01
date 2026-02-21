import crypto from "crypto";

export const BUILTIN_NODE_TYPES = new Set([
  "start",
  "end",
  "human_task",
  "approval",
  "form",
  "document_request",
  "ai_skill",
  "webhook",
]);

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeNodeType = (value) => String(value || "").trim().toLowerCase();

export const validateWorkflowDefinition = (definition = {}) => {
  if (!definition || typeof definition !== "object") {
    return { ok: false, error: "definition payload is required" };
  }

  const nodes = toArray(definition.nodes);
  const edges = toArray(definition.edges);
  const startNodeId = String(definition.startNodeId || "").trim();

  if (!definition.key || !String(definition.key).trim()) {
    return { ok: false, error: "definition.key is required" };
  }
  if (!definition.name || !String(definition.name).trim()) {
    return { ok: false, error: "definition.name is required" };
  }
  if (!startNodeId) {
    return { ok: false, error: "definition.startNodeId is required" };
  }
  if (!nodes.length) {
    return { ok: false, error: "definition.nodes must contain at least one node" };
  }
  if (!edges.length) {
    return { ok: false, error: "definition.edges must contain at least one edge" };
  }

  const nodeIdSet = new Set();
  for (const node of nodes) {
    const id = String(node?.id || "").trim();
    if (!id) return { ok: false, error: "every node requires id" };
    if (nodeIdSet.has(id)) return { ok: false, error: `duplicate node id: ${id}` };
    nodeIdSet.add(id);
    const nodeType = normalizeNodeType(node?.type);
    if (!nodeType) return { ok: false, error: `node '${id}' requires type` };
    if (!BUILTIN_NODE_TYPES.has(nodeType) && !nodeType.includes(".")) {
      return { ok: false, error: `unsupported node type '${nodeType}' for node '${id}'` };
    }
  }

  if (!nodeIdSet.has(startNodeId)) {
    return { ok: false, error: `startNodeId '${startNodeId}' does not exist` };
  }

  for (const edge of edges) {
    const from = String(edge?.from || "").trim();
    const to = String(edge?.to || "").trim();
    if (!from || !to) return { ok: false, error: "every edge requires from and to" };
    if (!nodeIdSet.has(from) || !nodeIdSet.has(to)) {
      return { ok: false, error: `edge '${from} -> ${to}' references unknown node` };
    }
  }

  return { ok: true };
};

export const computeDefinitionChecksum = (definition = {}) =>
  crypto.createHash("sha256").update(JSON.stringify(definition)).digest("hex");

export const normalizeDefinitionPayload = (definition = {}) => {
  const nodes = toArray(definition.nodes).map((node) => ({
    ...node,
    id: String(node.id),
    type: normalizeNodeType(node.type),
  }));
  const edges = toArray(definition.edges).map((edge) => ({
    from: String(edge.from),
    to: String(edge.to),
    on: String(edge.on || "node.completed"),
    guard: edge.guard ? String(edge.guard) : "",
    priority: Number.isFinite(Number(edge.priority)) ? Number(edge.priority) : 100,
  }));
  return {
    ...definition,
    key: String(definition.key || "").trim(),
    name: String(definition.name || "").trim(),
    packKey: String(definition.packKey || "").trim(),
    startNodeId: String(definition.startNodeId || "").trim(),
    nodes,
    edges,
  };
};

