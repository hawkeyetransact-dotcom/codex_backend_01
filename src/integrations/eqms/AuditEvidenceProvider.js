export class AuditEvidenceProvider {
  constructor({ systemKey, displayName, providerAliases = [] } = {}) {
    this.systemKey = systemKey || "unknown";
    this.displayName = displayName || this.systemKey;
    this.providerAliases = Array.isArray(providerAliases) ? providerAliases : [];
  }

  getCapabilities() {
    return [
      "fetchInternalCAPA",
      "fetchAuditFindings",
      "fetchDeviationRecords",
      "fetchEffectivenessChecks",
      "fetchSupportingDocuments",
      "fetchTrainingRecords",
      "getCAPARecords",
      "getAuditRecords",
      "getDocuments",
      "getAuditTrail",
      "syncUpdates",
    ];
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchInternalCAPA() {
    throw new Error("fetchInternalCAPA not implemented");
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchAuditFindings() {
    throw new Error("fetchAuditFindings not implemented");
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchDeviationRecords() {
    throw new Error("fetchDeviationRecords not implemented");
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchEffectivenessChecks() {
    throw new Error("fetchEffectivenessChecks not implemented");
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchSupportingDocuments() {
    throw new Error("fetchSupportingDocuments not implemented");
  }

  // eslint-disable-next-line class-methods-use-this
  async fetchTrainingRecords() {
    throw new Error("fetchTrainingRecords not implemented");
  }

  async getCAPARecords(context = {}) {
    return this.fetchInternalCAPA(context);
  }

  async getAuditRecords(context = {}) {
    const [findings, deviations] = await Promise.all([
      this.fetchAuditFindings(context),
      this.fetchDeviationRecords(context),
    ]);
    return [...(findings || []), ...(deviations || [])];
  }

  async getDocuments(context = {}) {
    return this.fetchSupportingDocuments(context);
  }

  // eslint-disable-next-line class-methods-use-this
  async getAuditTrail() {
    return [];
  }

  async syncUpdates(context = {}) {
    const [capaRecords, auditRecords, documents, effectivenessChecks, trainingRecords, auditTrail] =
      await Promise.all([
        this.getCAPARecords(context),
        this.getAuditRecords(context),
        this.getDocuments(context),
        this.fetchEffectivenessChecks(context),
        this.fetchTrainingRecords(context),
        this.getAuditTrail(context),
      ]);
    return {
      systemKey: this.systemKey,
      capaRecords: capaRecords || [],
      auditRecords: auditRecords || [],
      documents: documents || [],
      effectivenessChecks: effectivenessChecks || [],
      trainingRecords: trainingRecords || [],
      auditTrail: auditTrail || [],
    };
  }
}
