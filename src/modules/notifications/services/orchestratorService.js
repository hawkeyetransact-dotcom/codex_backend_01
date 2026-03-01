import crypto from "crypto";
import mongoose from "mongoose";
import Notification from "../models/notificationModel.js";
import NotificationPreference from "../models/notificationPreferenceModel.js";
import NotificationDeliveryLog from "../models/notificationDeliveryLogModel.js";
import { User } from "../../../models/userModel.js";
import { AuditRequestMaster } from "../../../models/auditRequestsMasterModel.js";
import { notificationRules, throttleWindows } from "../notificationRules.js";
import { emitNotification } from "./socket.js";

const hashKey = (str) => crypto.createHash("sha256").update(str).digest("hex");
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));
const toObjectIdString = (value) => (isObjectId(value) ? String(value) : null);

const EVENT_TITLE_MAP = {
  "audit.request.created": "New audit request assigned",
  "audit.request.assigned": "New audit request assigned",
  "audit.request.accepted": "Audit request accepted",
  "audit.request.rejected": "Audit request rejected",
  "audit.status.changed": "Audit status updated",
  "audit.supplier.decision": "Supplier decision received",
  "audit.phase.prep_started": "Pre-audit preparation started",
  "audit.phase.prep_completed": "Pre-audit preparation completed",
  "audit.phase.execution_started": "Execution phase started",
  "audit.artifact.sent": "Audit artifact sent",
  "audit.artifact.submitted": "Audit artifact submitted",
  "audit.intimation.sent": "Audit intimation sent",
  "audit.intimation.response": "Supplier response received",
  "questionnaire.section_assigned": "Questionnaire section assigned",
  "questionnaire.section_submitted": "Section responses submitted",
  "questionnaire.followup.assigned": "Follow-up requested",
  "questionnaire.submitted": "Questionnaire submitted",
  "questionnaire.overdue": "Questionnaire overdue",
  "capa.assigned": "CAPA action required",
  "rfq.event": "RFQ update",
};

const startCase = (value = "") =>
  String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const addQuery = (path, entries = []) => {
  if (!path || !entries.length) return path;
  const [base, hash = ""] = path.split("#");
  const [pathname, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  entries.forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const next = params.toString();
  return `${pathname}${next ? `?${next}` : ""}${hash ? `#${hash}` : ""}`;
};

const normalizeActionPath = (url) => {
  if (!url) return null;
  let normalized = String(url).trim();
  if (!normalized) return null;

  try {
    if (/^https?:\/\//i.test(normalized)) {
      const parsed = new URL(normalized);
      normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // keep as-is if URL parsing fails
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized.replace(/^\/+/, "")}`;
  }

  normalized = normalized.replace(/^\/audits\/([^/?#]+)\/responses$/i, "/audits/$1/report");
  normalized = normalized.replace(/^\/rfqs\/([^/?#]+)\/quotes$/i, "/rfqs/$1/compare");
  normalized = normalized.replace(/^\/auditor\/rfqs\/([^/?#]+)\/quotes$/i, "/auditor/rfqs/$1");
  normalized = normalized.replace(/^\/capas\/([^/?#]+)$/i, "/auditor/capas?capaId=$1");

  return normalized;
};

const deriveDefaultAction = (eventName, payload) => {
  const entityType = String(payload?.entityType || "").toLowerCase();
  const entityId = payload?.entityId ? String(payload.entityId) : "";
  if (!entityId) return null;

  if (entityType === "audit") {
    if (eventName === "audit.status.changed") {
      return addQuery(`/audits/${entityId}/progress`, [["focus", "status"]]);
    }
    if (eventName.startsWith("audit.phase.")) {
      return addQuery(`/audits/${entityId}/progress`, [["focus", "phase"]]);
    }
    if (eventName.startsWith("audit.intimation.")) {
      return addQuery(`/audits/${entityId}/artifacts`, [["artifactType", "INTIMATION_LETTER"]]);
    }
    if (
      eventName.startsWith("questionnaire.") ||
      eventName.startsWith("question.") ||
      eventName.startsWith("audit.artifact.")
    ) {
      const focus =
        eventName === "questionnaire.followup.assigned" ? "followup" : undefined;
      return addQuery(`/audits/${entityId}/report`, [
        ["mode", "questionnaire"],
        ["focus", focus],
      ]);
    }
    if (eventName.startsWith("audit.request.") || eventName === "audit.supplier.decision") {
      return `/audits/${entityId}/summary`;
    }
    return `/audits/${entityId}`;
  }

  if (entityType === "rfq") {
    return `/auditor/rfqs/${entityId}`;
  }

  if (entityType === "capa") {
    return `/auditor/capas?capaId=${entityId}`;
  }

  return null;
};

const resolveAction = (eventName, payload) => {
  const provided = normalizeActionPath(payload?.action?.url || null);
  const fallback = deriveDefaultAction(eventName, payload);

  let finalUrl = provided || fallback;
  if (!finalUrl) return undefined;

  const entityType = String(payload?.entityType || "").toLowerCase();
  const entityId = payload?.entityId ? String(payload.entityId) : "";
  const isGenericAudit = entityType === "audit" && !!entityId && new RegExp(`^/audits/${entityId}$`).test(finalUrl);
  if (isGenericAudit) {
    finalUrl = fallback || finalUrl;
  }

  if (eventName === "questionnaire.followup.assigned") {
    finalUrl = addQuery(finalUrl, [["focus", "followup"], ["mode", "questionnaire"]]);
  }

  if (eventName === "audit.status.changed") {
    finalUrl = addQuery(finalUrl, [["focus", "status"]]);
  }

  if (eventName.startsWith("audit.phase.")) {
    finalUrl = addQuery(finalUrl, [["focus", "phase"]]);
  }

  return {
    label: payload?.action?.label || "Open",
    url: finalUrl,
  };
};

const resolveTitle = (eventName, payload) => {
  const raw = String(payload?.title || "").trim();
  if (raw) return raw;
  if (EVENT_TITLE_MAP[eventName]) return EVENT_TITLE_MAP[eventName];
  if (eventName.startsWith("milestone.")) return "Milestone update";
  return startCase(eventName || "notification");
};

const resolveMessage = (eventName, payload, title) => {
  const raw = String(payload?.message || "").trim();
  if (raw) return raw;
  if (eventName.startsWith("milestone.")) return "Milestone state changed.";
  return title;
};

const resolveTenantId = async (contextTenantId, payload) => {
  const direct = toObjectIdString(contextTenantId || payload?.tenantId || payload?.metadata?.tenantId);
  if (direct) return direct;

  const entityType = String(payload?.entityType || "").toLowerCase();
  const entityId = payload?.entityId ? String(payload.entityId) : "";
  if (entityType === "audit" && isObjectId(entityId)) {
    const audit = await AuditRequestMaster.findById(entityId).select("tenantOrgId").lean();
    const fromAudit = toObjectIdString(audit?.tenantOrgId);
    if (fromAudit) return fromAudit;
  }

  return null;
};

const applyThrottle = async (rule, key, tenantId, recipientUserId) => {
  const windowMs = throttleWindows[rule.throttle || "none"] || 0;
  if (!windowMs) return false;
  const since = new Date(Date.now() - windowMs);
  const existing = await Notification.findOne({
    tenantId,
    recipientUserId,
    idempotencyKey: key,
    createdAt: { $gte: since },
    isDeleted: false,
  });
  return !!existing;
};

const resolveRecipients = async (strategy, context) => {
  const { tenantId, recipientUserIds, role } = context;
  if (strategy === "explicit" && recipientUserIds?.length) return recipientUserIds;
  if (strategy === "role" && role) {
    const users = await User.find({ tenant_id: tenantId, role, status: "ACTIVE" }, { _id: 1 });
    return users.map((u) => u._id);
  }
  if (strategy === "tenant_admins") {
    const users = await User.find({ tenant_id: tenantId, role: { $in: ["tenant_admin", "superadmin"] }, status: "ACTIVE" }, { _id: 1 });
    return users.map((u) => u._id);
  }
  if (strategy === "assigned_auditor" && context.entityType === "audit") {
    const audit = await AuditRequestMaster.findById(context.entityId);
    if (audit?.auditor_id) return [audit.auditor_id];
  }
  if (strategy === "buyer_owner" && context.entityType === "audit") {
    const audit = await AuditRequestMaster.findById(context.entityId);
    if (audit?.create_by_buyer_id) return [audit.create_by_buyer_id];
  }
  if (strategy === "supplier_owner" && context.entityType === "audit") {
    const audit = await AuditRequestMaster.findById(context.entityId);
    if (audit?.supplier_id) return [audit.supplier_id];
  }
  return [];
};

const shouldDeliver = (pref, eventType, severity, rule, actionRequired) => {
  if (pref.channels?.inApp === false) return false;
  if (pref.mutedTypes?.includes(eventType)) return false;
  if (rule?.requiresSubscription) {
    const subscribed = pref.subscribedTypes || [];
    if (!actionRequired && !subscribed.includes(eventType)) return false;
  }
  const order = { info: 1, warning: 2, critical: 3 };
  if (order[severity] < order[pref.minimumSeverity || "info"]) return false;
  return true;
};

const computeDndSnooze = (pref) => {
  if (!pref.doNotDisturb?.startTime || !pref.doNotDisturb?.endTime) return null;
  const now = new Date();
  const [sh, sm] = pref.doNotDisturb.startTime.split(":").map(Number);
  const [eh, em] = pref.doNotDisturb.endTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(sh, sm || 0, 0, 0);
  const end = new Date(now);
  end.setHours(eh, em || 0, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  if (now >= start && now <= end) return end;
  return null;
};

const resolveRule = (eventName) => {
  if (notificationRules[eventName]) return notificationRules[eventName];
  if (eventName && eventName.startsWith("milestone.")) {
    return { severity: "info", channels: ["inApp"], throttle: "once_per_24h" };
  }
  return {};
};

export const NotificationOrchestratorService = {
  emitEvent: async (eventName, payload, context) => {
    const rule = resolveRule(eventName);
    const severity = payload.severity || rule.severity || "info";
    const channels = payload.channels || rule.channels || ["inApp"];
    const tenantId = await resolveTenantId(context?.tenantId, payload);
    const strategy = payload.recipientStrategy || rule.recipientStrategy || "explicit";
    const rawRecipients =
      payload.recipientUserIds ||
      (await resolveRecipients(strategy, {
        ...context,
        tenantId,
        entityType: payload.entityType,
        entityId: payload.entityId,
        role: payload.role,
      }));
    const recipientUserIds = Array.from(
      new Set(
        (rawRecipients || [])
          .map((id) => String(id || ""))
          .filter((id) => isObjectId(id))
      )
    );

    const created = [];
    const title = resolveTitle(eventName, payload);
    const message = resolveMessage(eventName, payload, title);
    const action = resolveAction(eventName, payload);

    for (const recipientId of recipientUserIds) {
      try {
        let tenantForRecipient = tenantId;
        if (!tenantForRecipient) {
          const recipient = await User.findById(recipientId).select("tenant_id").lean();
          tenantForRecipient = toObjectIdString(recipient?.tenant_id);
        }
        if (!tenantForRecipient) continue;

        const idKey = hashKey(
          [
            tenantForRecipient || "",
            recipientId || "",
            eventName || "",
            payload.entityType || "",
            payload.entityId || "",
            payload.step || "",
          ].join("|")
        );
        const throttled = await applyThrottle(rule, idKey, tenantForRecipient, recipientId);
        if (throttled) continue;

        const pref = await NotificationPreference.findOne({ tenantId: tenantForRecipient, userId: recipientId });
        const dndUntil = pref ? computeDndSnooze(pref) : null;
        const deliver = pref
          ? shouldDeliver(pref, eventName, severity, rule, payload.actionRequired)
          : !rule.requiresSubscription || payload.actionRequired;
        if (!deliver) continue;

        const metadata = {
          ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
          eventName,
          step: payload.step || null,
          actorRole: context?.role || null,
          auditRequestId:
            String(payload?.entityType || "").toLowerCase() === "audit" ? String(payload?.entityId || "") : undefined,
        };

        const doc = await Notification.create({
          tenantId: tenantForRecipient,
          recipientUserId: recipientId,
          recipientRole: context?.role,
          type: eventName,
          severity,
          title,
          message,
          entityType: payload.entityType,
          entityId: payload.entityId,
          action,
          metadata,
          channels,
          snoozedUntil: dndUntil,
          idempotencyKey: idKey,
        });

        await NotificationDeliveryLog.create({
          tenantId: tenantForRecipient,
          notificationId: doc._id,
          channel: "inApp",
          status: "sent",
        });
        emitNotification(tenantForRecipient, recipientId, doc);
        created.push(doc);
      } catch (error) {
        console.error("notification emit failed", eventName, recipientId, error?.message || error);
      }
    }
    return created;
  },
};
