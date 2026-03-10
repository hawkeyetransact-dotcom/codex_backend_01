import { ComplianceEventCanonical } from "../../models/complianceEventCanonicalModel.js";
import { IntegrationRunLog } from "../../models/integrationRunLogModel.js";
import { AuditEvidenceProvider } from "./AuditEvidenceProvider.js";

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export class BaseEqmsConnector extends AuditEvidenceProvider {
  constructor({ systemKey, displayName, providerAliases = [] } = {}) {
    super({ systemKey, displayName, providerAliases });
  }

  buildQuery({ tenantId, supplierId, siteId, connectionId, eventType } = {}) {
    const query = {
      providerKey: { $in: this.providerAliases.length ? this.providerAliases : [this.systemKey] },
    };
    if (tenantId) query.tenantId = tenantId;
    if (supplierId) query.supplierId = supplierId;
    if (siteId) query.siteId = siteId;
    if (connectionId) query.connectionId = connectionId;
    if (eventType) query.eventType = eventType;
    return query;
  }

  async fetchCanonicalEvents({ tenantId, supplierId, siteId, connectionId, eventType, limit = 500 } = {}) {
    const query = this.buildQuery({ tenantId, supplierId, siteId, connectionId, eventType });
    return ComplianceEventCanonical.find(query).sort({ openedDate: -1, createdAt: -1 }).limit(limit).lean();
  }

  toInternalCapaRecord(event = {}) {
    return {
      internalCapaId: `${this.systemKey}:${String(event.eventId || event._id)}`,
      externalCAPAId: String(event.eventId || event._id),
      severity: event.severity || "Unknown",
      status: event.status || "Open",
      openedDate: toDate(event.openedDate),
      closedDate: toDate(event.closedDate),
      dueDate: toDate(event.dueDate),
      riskCategory:
        event.metadata?.riskCategory || event.metadata?.category || event.metadata?.topic || "GENERAL",
      sourceAuditId: event.linkedAuditId || null,
      sourceEventId: String(event._id || ""),
      siteId: event.siteId || null,
      supplierId: event.supplierId || null,
      metadata: event.metadata || {},
    };
  }

  async fetchInternalCAPA(context = {}) {
    const events = await this.fetchCanonicalEvents({ ...context, eventType: "CAPA" });
    return events.map((event) => this.toInternalCapaRecord(event));
  }

  async fetchAuditFindings(context = {}) {
    return this.fetchCanonicalEvents({ ...context, eventType: "AUDIT_FINDING" });
  }

  async fetchDeviationRecords(context = {}) {
    return this.fetchCanonicalEvents({ ...context, eventType: "DEVIATION" });
  }

  async fetchEffectivenessChecks(context = {}) {
    const events = await this.fetchCanonicalEvents({ ...context, eventType: "CHANGE_CONTROL" });
    return events.filter(
      (event) => Boolean(event.metadata?.effectivenessCheck) || /effectiveness/i.test(String(event.metadata?.title || ""))
    );
  }

  async fetchSupportingDocuments(context = {}) {
    const events = await this.fetchCanonicalEvents({ ...context });
    const docs = [];
    events.forEach((event) => {
      const documents = event.metadata?.documents;
      if (!Array.isArray(documents)) return;
      documents.forEach((doc) => {
        docs.push({
          ...doc,
          eventId: event.eventId,
          eventType: event.eventType,
          sourceSystem: this.systemKey,
          sourceEventId: String(event._id || ""),
        });
      });
    });
    return docs;
  }

  async fetchTrainingRecords(context = {}) {
    const events = await this.fetchCanonicalEvents({ ...context });
    return events
      .filter(
        (event) =>
          /training/i.test(String(event.metadata?.riskCategory || "")) ||
          /training/i.test(String(event.metadata?.title || "")) ||
          Boolean(event.metadata?.trainingRecord)
      )
      .map((event) => ({
        eventId: event.eventId,
        sourceEventId: String(event._id || ""),
        title: event.metadata?.title || "Training related quality signal",
        status: event.status,
        openedDate: event.openedDate,
        metadata: event.metadata || {},
      }));
  }

  async getAuditTrail({ tenantId, connectionId, limit = 100 } = {}) {
    const query = { providerKey: { $in: this.providerAliases.length ? this.providerAliases : [this.systemKey] } };
    if (tenantId) query.tenantId = tenantId;
    if (connectionId) query.connectionId = connectionId;
    return IntegrationRunLog.find(query).sort({ startedAt: -1 }).limit(limit).lean();
  }
}
