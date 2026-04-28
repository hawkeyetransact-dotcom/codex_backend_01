import {
  CapaActionItem,
  CapaApproval,
  CapaCandidate,
  CapaComment,
  CapaEffectivenessCheck,
  CapaImplementationEvidence,
  CapaIntake,
  CapaInvestigation,
  CapaMetricSnapshot,
  CapaRiskAssessment,
  CapaRootCause,
  CapaSimilarityLink,
  CapaSourceLink,
  CapaStatusHistory,
  CapaTriage,
  CapaV2,
  CapaActionPlan,
} from "../models/capaV2Models.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { Capa as LegacyCapa } from "../models/capaModel.js";
import {
  attachSimilarityLinksForCapa,
  generateCandidatePrefillsFromAudit,
  nextCapaNumber,
  persistCandidatePrefills,
  toObjectId,
} from "../modules/capaV2/prefillService.js";
import { CAPA_V2_APPROVAL_STAGES, CAPA_V2_TRIAGE_DECISIONS } from "../modules/capaV2/constants.js";
import { assertCapaV2Transition } from "../modules/capaV2/statusMachine.js";
import { writeAuditEvent } from "../services/auditEventService.js";
import { notifySupplier, notifyUsers } from "../services/governance/notifySupplier.js";

const normalizeRole = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const isAdminRole = (role) =>
  ["admin", "superadmin", "tenantadmin", "tenant_admin"].includes(normalizeRole(role));

const isAuditorRole = (role) => ["auditor", "leadauditor", "lead_auditor"].includes(normalizeRole(role));
const isBuyerRole = (role) => normalizeRole(role) === "buyer";
const isSupplierRole = (role) => ["supplier", "supplieruser"].includes(normalizeRole(role));

const tenantIdFromReq = (req) => req.tenantId || req.user?.tenant_id || null;

const withTenantFilter = (req, filter = {}) => ({
  ...filter,
  tenantOrgId: tenantIdFromReq(req),
});

const applyPersonaScope = (req, filter = {}) => {
  const role = normalizeRole(req.user?.role);
  const userId = req.user?._id;
  if (!userId || isAdminRole(role)) return filter;
  if (isBuyerRole(role)) return { ...filter, buyerId: userId };
  if (isAuditorRole(role)) {
    return {
      ...filter,
      $or: [{ auditorId: userId }, { ownerUserId: userId }, { assignedTeamUserIds: userId }],
    };
  }
  if (isSupplierRole(role)) {
    return {
      ...filter,
      $or: [{ supplierId: userId }, { ownerUserId: userId }, { assignedTeamUserIds: userId }],
    };
  }
  return { ...filter, _id: null };
};

const ensureTenant = (req, res) => {
  const tenantId = tenantIdFromReq(req);
  if (!tenantId) {
    res.status(400).json({ success: false, error: "Tenant context missing" });
    return null;
  }
  return tenantId;
};

const resolveActorScopedRefs = (req, payload = {}) => {
  const role = normalizeRole(req.user?.role);
  const actorId = toObjectId(req.user?._id);
  const refs = {
    supplierId: toObjectId(payload.supplierId),
    buyerId: toObjectId(payload.buyerId),
    auditorId: toObjectId(payload.auditorId),
  };

  if (!actorId) return refs;

  if (isBuyerRole(role) && !refs.buyerId) {
    refs.buyerId = actorId;
  }

  if ((isAuditorRole(role) || isAdminRole(role)) && !refs.auditorId) {
    refs.auditorId = actorId;
  }

  if (isSupplierRole(role) && !refs.supplierId) {
    refs.supplierId = actorId;
  }

  return refs;
};

const buildScopedFilter = (req, baseFilter = {}) => {
  const tenantFilter = withTenantFilter(req, baseFilter);
  const personaScope = applyPersonaScope(req, {});
  const clauses = [tenantFilter];
  if (personaScope && Object.keys(personaScope).length) {
    clauses.push(personaScope);
  }
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
};

const appendStatusHistory = async ({
  tenantOrgId,
  capaId,
  fromStatus,
  toStatus,
  reason,
  actorId,
  actorRole,
  metadata = {},
}) =>
  CapaStatusHistory.create({
    tenantOrgId,
    capaId,
    fromStatus: fromStatus || null,
    toStatus,
    reason: reason || "",
    actor: {
      actorId: actorId || null,
      actorRole: actorRole || "",
      timestamp: new Date(),
      note: reason || "",
    },
    metadata,
  });

const transitionCapaStatus = async ({ capa, toStatus, reason, req, metadata = {} }) => {
  assertCapaV2Transition({ fromStatus: capa.status, toStatus, capa });
  const fromStatus = capa.status;
  capa.status = toStatus;
  if (toStatus === "CLOSED_EFFECTIVE" || toStatus === "CLOSED_INEFFECTIVE") {
    capa.closedAt = capa.closedAt || new Date();
  }
  capa.updatedBy = req.user?._id || null;
  await capa.save();
  await appendStatusHistory({
    tenantOrgId: capa.tenantOrgId,
    capaId: capa._id,
    fromStatus,
    toStatus,
    reason,
    actorId: req.user?._id,
    actorRole: req.user?.role,
    metadata,
  });
  if (capa.auditId) {
    await writeAuditEvent({
      tenantId: capa.tenantOrgId,
      auditId: capa.auditId,
      entityType: "capa_v2",
      entityId: capa._id,
      action: `CAPA_V2_STATUS_${toStatus}`,
      actorId: req.user?._id,
      actorRole: req.user?.role,
      before: { status: fromStatus },
      after: { status: toStatus },
      ip: req.ip,
      userAgent: req.get("user-agent"),
      meta: metadata,
    });
  }
  return capa;
};

const createMetricSnapshot = async (capa) => {
  const [actionItems, effectiveness] = await Promise.all([
    CapaActionItem.find({ tenantOrgId: capa.tenantOrgId, capaId: capa._id }).lean(),
    CapaEffectivenessCheck.findOne({ tenantOrgId: capa.tenantOrgId, capaId: capa._id }).lean(),
  ]);
  const actionItemsTotal = actionItems.length;
  const actionItemsClosed = actionItems.filter((item) => item.status === "COMPLETED").length;
  const now = Date.now();
  const createdAt = new Date(capa.createdAt || now).getTime();
  const dueAt = new Date(capa.dueDate || now).getTime();
  const ageDays = Math.max(0, Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)));
  const overdueDays =
    Number.isFinite(dueAt) && now > dueAt ? Math.floor((now - dueAt) / (24 * 60 * 60 * 1000)) : 0;

  const snapshot = await CapaMetricSnapshot.create({
    tenantOrgId: capa.tenantOrgId,
    capaId: capa._id,
    snapshotAt: new Date(),
    ageDays,
    overdueDays,
    actionItemsTotal,
    actionItemsClosed,
    effectivenessResult: effectiveness?.result || "PENDING",
    recurrenceFlag: Boolean(capa.recurrenceFlag),
    status: capa.status,
  });
  await CapaV2.updateOne(
    { _id: capa._id, tenantOrgId: capa.tenantOrgId },
    { $set: { latestMetricSnapshotId: snapshot._id } }
  );
  return snapshot;
};

const createFormalCapaFromTriage = async ({ triage, intake, req }) => {
  const capaNumber = await nextCapaNumber({ tenantOrgId: intake.tenantOrgId });
  const capa = await CapaV2.create({
    tenantOrgId: intake.tenantOrgId,
    capaNumber,
    title: intake.issueTitleDraft || "CAPA",
    issueStatement: intake.issueStatementDraft || intake.issueTitleDraft || "",
    issueDescription: intake.issueDescriptionDraft || "",
    sourceClassification: intake.sourceClassification || "QUESTIONNAIRE_REVIEW",
    classification:
      triage.decision === "CORRECTION_ONLY" ? "CORRECTION_ONLY" : intake.classificationSuggestion || "FULL_CAPA",
    severity: triage.severity || intake.severitySuggestion || "MEDIUM",
    riskLevel: triage.riskLevel || "MEDIUM",
    status: triage.decision === "CORRECTION_ONLY" ? "CORRECTION_ONLY" : "CAPA_OPEN",
    auditId: intake.auditId || null,
    supplierId: intake.supplierId || null,
    buyerId: intake.buyerId || null,
    auditorId: intake.auditorId || null,
    siteId: intake.siteId || null,
    productId: intake.productId || null,
    ownerRole: intake.ownerRoleSuggestion || "supplier_quality_lead",
    triageDecision: triage.decision,
    dueDate: intake.dueDateSuggestion || null,
    targetClosureDate: intake.dueDateSuggestion || null,
    sourceCandidateId: intake.candidateId || null,
    sourceIntakeId: intake._id,
    sourceTriageId: triage._id,
    createdBy: req.user?._id || null,
    updatedBy: req.user?._id || null,
    metadata: { autoGenerated: true, generatedAt: new Date() },
  });
  if (Array.isArray(intake.sourceReferences) && intake.sourceReferences.length) {
    const links = intake.sourceReferences.map((ref) => ({
      tenantOrgId: intake.tenantOrgId,
      capaId: capa._id,
      sourceType: ref.sourceType || "QUESTIONNAIRE_REVIEW",
      sourceRecordType:
        ref.questionId || ref.sourcePath?.includes("auditQuestions")
          ? "audit_question"
          : ref.reportObservationId
          ? "report_observation"
          : "audit_artifact",
      sourceRecordId: String(ref.questionId || ref.reportObservationId || ref.reportId || ref.auditId || ""),
      auditId: ref.auditId || intake.auditId || null,
      questionId: ref.questionId || null,
      reportObservationId: ref.reportObservationId || null,
      findingId: ref.findingId || null,
      evidenceId: ref.evidenceId || null,
      evidenceDocumentName: ref.evidenceDocumentName || "",
      snippet: ref.snippet || "",
      confidence: Number(ref.confidence || 0.5),
      autoFillStatus: ref.autoFillStatus || "supported_inference",
      createdBy: req.user?._id || null,
    }));
    await CapaSourceLink.insertMany(links, { ordered: false });
  }
  await appendStatusHistory({
    tenantOrgId: capa.tenantOrgId,
    capaId: capa._id,
    fromStatus: null,
    toStatus: capa.status,
    reason: "Created from triage decision",
    actorId: req.user?._id,
    actorRole: req.user?.role,
    metadata: { triageId: String(triage._id), intakeId: String(intake._id) },
  });
  await createMetricSnapshot(capa);
  await attachSimilarityLinksForCapa({ capa });
  return capa;
};

export const createCandidateFromAuditFinding = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const payload = req.body || {};
    const actorScopedRefs = resolveActorScopedRefs(req, payload);
    if (!payload.title) {
      return res.status(400).json({ success: false, error: "title is required" });
    }
    const candidate = await CapaCandidate.create({
      tenantOrgId,
      auditId: toObjectId(payload.auditId),
      supplierId: actorScopedRefs.supplierId,
      buyerId: actorScopedRefs.buyerId,
      auditorId: actorScopedRefs.auditorId,
      siteId: toObjectId(payload.siteId),
      productId: toObjectId(payload.productId),
      title: String(payload.title).slice(0, 300),
      issueStatement: String(payload.issueStatement || "").slice(0, 500),
      detailedDescription: String(payload.detailedDescription || ""),
      observationCategory: String(payload.observationCategory || "QUALITY_SYSTEM"),
      severitySuggestion: payload.severitySuggestion || "MEDIUM",
      riskRationaleDraft: payload.riskRationaleDraft || "",
      classificationSuggestion: payload.classificationSuggestion || "FULL_CAPA",
      dueDateSuggestion: payload.dueDateSuggestion || null,
      sourceReferences: Array.isArray(payload.sourceReferences) ? payload.sourceReferences : [],
      traceability: Array.isArray(payload.traceability) ? payload.traceability : [],
      recurrenceFlag: Boolean(payload.recurrenceFlag),
      generatedByEngine: payload.generatedByEngine || "MANUAL",
      metadata: payload.metadata || {},
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ success: true, data: candidate });
  } catch (error) {
    console.error("createCandidateFromAuditFinding error", error);
    return res.status(500).json({ success: false, error: "Failed to create CAPA candidate" });
  }
};

export const generateDraftPrefillFromAuditSources = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { auditId } = req.params;
    const result = await generateCandidatePrefillsFromAudit({ auditIdOrAlias: auditId, tenantId: tenantOrgId });
    return res.json({
      success: true,
      data: {
        auditId: String(result.audit._id),
        sourceStats: result.sourceStats,
        prefills: result.prefills,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ success: false, error: error.message || "Failed to generate prefill draft" });
  }
};

export const bulkGenerateCandidatesFromAudit = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { auditId } = req.params;
    const generated = await generateCandidatePrefillsFromAudit({ auditIdOrAlias: auditId, tenantId: tenantOrgId });
    const created = await persistCandidatePrefills({ prefills: generated.prefills, actorId: req.user?._id });
    return res.json({
      success: true,
      data: {
        auditId: String(generated.audit._id),
        generatedCount: generated.prefills.length,
        persistedCount: created.length,
        sourceStats: generated.sourceStats,
        items: created,
      },
    });
  } catch (error) {
    const status = error.status || 500;
    console.error("bulkGenerateCandidatesFromAudit error", error);
    return res.status(status).json({ success: false, error: error.message || "Failed to generate candidate queue" });
  }
};

export const getCandidateQueue = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 20)));
    const filter = withTenantFilter(req, {});
    if (req.query.status) filter.status = req.query.status;
    if (req.query.auditId) filter.auditId = toObjectId(req.query.auditId);
    if (req.query.supplierId) filter.supplierId = toObjectId(req.query.supplierId);
    if (req.query.siteId) filter.siteId = toObjectId(req.query.siteId);
    if (req.query.severity) filter.severitySuggestion = req.query.severity;

    const scopedFilter = applyPersonaScope(req, filter);
    const [items, total] = await Promise.all([
      CapaCandidate.find(scopedFilter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      CapaCandidate.countDocuments(scopedFilter),
    ]);

    return res.json({ success: true, data: items, meta: { total, page, pageSize } });
  } catch (error) {
    console.error("getCandidateQueue error", error);
    return res.status(500).json({ success: false, error: "Failed to load candidate queue" });
  }
};

export const createCAPAIntake = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const payload = req.body || {};
    let seed = {};
    if (payload.candidateId) {
      const candidate = await CapaCandidate.findOne(withTenantFilter(req, { _id: payload.candidateId }));
      if (!candidate) return res.status(404).json({ success: false, error: "Candidate not found" });
      seed = {
        candidateId: candidate._id,
        auditId: candidate.auditId,
        supplierId: candidate.supplierId,
        buyerId: candidate.buyerId,
        auditorId: candidate.auditorId,
        siteId: candidate.siteId,
        productId: candidate.productId,
        sourceClassification: "QUESTIONNAIRE_REVIEW",
        triggerSourceRecordIds: (candidate.traceability || []).map((item) => item.sourceRecordId).filter(Boolean),
        issueTitleDraft: candidate.title,
        issueStatementDraft: candidate.issueStatement,
        issueDescriptionDraft: candidate.detailedDescription,
        observationCategory: candidate.observationCategory,
        severitySuggestion: candidate.severitySuggestion,
        riskRationaleDraft: candidate.riskRationaleDraft,
        classificationSuggestion: candidate.classificationSuggestion,
        dueDateSuggestion: candidate.dueDateSuggestion,
        sourceReferences: candidate.sourceReferences || [],
        autoFillConfidence: Math.min(
          0.95,
          Math.max(0.35, Number((candidate.sourceReferences || [])[0]?.confidence || 0.6))
        ),
      };
    }
    const intake = await CapaIntake.create({
      tenantOrgId,
      ...seed,
      ...payload,
      state: "DRAFT",
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    // Heads-up to the supplier as soon as a CAPA intake is opened on them.
    if (intake.supplierId) {
      notifySupplier({
        tenantId: tenantOrgId,
        supplierUserId: intake.supplierId,
        eventKey: "CAPA_INTAKE_OPENED",
        payload: {
          intakeId: intake._id,
          auditId: intake.auditId,
          observationCategory: intake.observationCategory,
          severitySuggestion: intake.severitySuggestion,
        },
      }).catch((e) => console.error("notifySupplier(CAPA_INTAKE_OPENED) failed:", e?.message));
    }

    return res.status(201).json({ success: true, data: intake });
  } catch (error) {
    console.error("createCAPAIntake error", error);
    return res.status(500).json({ success: false, error: "Failed to create CAPA intake" });
  }
};

export const updateCAPAIntake = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { intakeId } = req.params;
    const intake = await CapaIntake.findOne(withTenantFilter(req, { _id: intakeId }));
    if (!intake) return res.status(404).json({ success: false, error: "Intake not found" });
    if (intake.state !== "DRAFT") {
      return res.status(400).json({ success: false, error: "Only draft intake can be edited" });
    }
    Object.assign(intake, req.body || {});
    intake.updatedBy = req.user?._id || null;
    await intake.save();
    return res.json({ success: true, data: intake });
  } catch (error) {
    console.error("updateCAPAIntake error", error);
    return res.status(500).json({ success: false, error: "Failed to update CAPA intake" });
  }
};

export const submitForTriage = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { intakeId } = req.params;
    const intake = await CapaIntake.findOne(withTenantFilter(req, { _id: intakeId }));
    if (!intake) return res.status(404).json({ success: false, error: "Intake not found" });
    if (intake.state !== "DRAFT") {
      return res.status(400).json({ success: false, error: "Intake already submitted" });
    }
    intake.state = "SUBMITTED";
    intake.submittedForTriageAt = new Date();
    intake.submittedForTriageBy = req.user?._id || null;
    intake.updatedBy = req.user?._id || null;
    await intake.save();

    const triage = await CapaTriage.create({
      tenantOrgId,
      intakeId: intake._id,
      candidateId: intake.candidateId || null,
      auditId: intake.auditId || null,
      severity: intake.severitySuggestion || "MEDIUM",
      triageState: "OPEN",
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    return res.json({ success: true, data: triage });
  } catch (error) {
    console.error("submitForTriage error", error);
    return res.status(500).json({ success: false, error: "Failed to submit intake for triage" });
  }
};

export const triageCAPA = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { triageId } = req.params;
    const decision = String(req.body?.decision || "");
    if (!CAPA_V2_TRIAGE_DECISIONS.includes(decision)) {
      return res.status(400).json({ success: false, error: "Invalid triage decision" });
    }
    const triage = await CapaTriage.findOne(withTenantFilter(req, { _id: triageId }));
    if (!triage) return res.status(404).json({ success: false, error: "Triage record not found" });
    if (triage.triageState === "DECIDED") {
      return res.status(400).json({ success: false, error: "Triage decision already recorded" });
    }
    const intake = await CapaIntake.findOne(withTenantFilter(req, { _id: triage.intakeId }));
    if (!intake) return res.status(404).json({ success: false, error: "Linked intake not found" });

    triage.triageState = "DECIDED";
    triage.decision = decision;
    triage.rationale = String(req.body?.rationale || "");
    triage.severity = String(req.body?.severity || triage.severity || intake.severitySuggestion || "MEDIUM");
    triage.riskLevel = String(req.body?.riskLevel || triage.riskLevel || "MEDIUM");
    triage.correctionRequired = decision === "CORRECTION_ONLY" || decision === "FORMAL_CAPA_REQUIRED";
    triage.formalCapaRequired = decision === "FORMAL_CAPA_REQUIRED";
    triage.decidedAt = new Date();
    triage.decidedBy = req.user?._id || null;
    triage.updatedBy = req.user?._id || null;
    await triage.save();

    let capa = null;
    if (decision === "FORMAL_CAPA_REQUIRED" || decision === "CORRECTION_ONLY") {
      capa = await createFormalCapaFromTriage({ triage, intake, req });
      triage.linkedCapaId = capa._id;
      await triage.save();
      if (intake.candidateId) {
        await CapaCandidate.updateOne(
          { _id: intake.candidateId, tenantOrgId },
          {
            $set: {
              status: "CONVERTED",
              triageDecision: decision,
              linkedCapaId: capa._id,
              reviewedAt: new Date(),
              reviewedBy: req.user?._id || null,
              updatedBy: req.user?._id || null,
            },
          }
        );
      }
    } else if (decision === "NO_CAPA_NEEDED" && intake.candidateId) {
      await CapaCandidate.updateOne(
        { _id: intake.candidateId, tenantOrgId },
        {
          $set: {
            status: "DISMISSED",
            triageDecision: decision,
            reviewedAt: new Date(),
            reviewedBy: req.user?._id || null,
            updatedBy: req.user?._id || null,
          },
        }
      );
    }
    return res.json({ success: true, data: { triage, capa } });
  } catch (error) {
    console.error("triageCAPA error", error);
    return res.status(500).json({ success: false, error: "Failed to triage CAPA" });
  }
};

export const createFormalCAPA = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const payload = req.body || {};
    const actorScopedRefs = resolveActorScopedRefs(req, payload);
    if (!payload.title) {
      return res.status(400).json({ success: false, error: "title is required" });
    }
    const capaNumber = await nextCapaNumber({ tenantOrgId });
    const capa = await CapaV2.create({
      tenantOrgId,
      capaNumber,
      title: String(payload.title).slice(0, 300),
      issueStatement: payload.issueStatement || "",
      issueDescription: payload.issueDescription || "",
      sourceClassification: payload.sourceClassification || "MANUAL",
      classification: payload.classification || "FULL_CAPA",
      severity: payload.severity || "MEDIUM",
      riskLevel: payload.riskLevel || "MEDIUM",
      status: payload.status || "CAPA_OPEN",
      auditId: toObjectId(payload.auditId),
      supplierId: actorScopedRefs.supplierId,
      buyerId: actorScopedRefs.buyerId,
      auditorId: actorScopedRefs.auditorId,
      siteId: toObjectId(payload.siteId),
      productId: toObjectId(payload.productId),
      ownerUserId: toObjectId(payload.ownerUserId),
      ownerRole: payload.ownerRole || "supplier_quality_lead",
      dueDate: payload.dueDate || null,
      targetClosureDate: payload.targetClosureDate || null,
      metadata: payload.metadata || {},
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    await appendStatusHistory({
      tenantOrgId,
      capaId: capa._id,
      fromStatus: null,
      toStatus: capa.status,
      reason: "CAPA created manually",
      actorId: req.user?._id,
      actorRole: req.user?.role,
      metadata: { createMode: "manual" },
    });
    await createMetricSnapshot(capa);
    await attachSimilarityLinksForCapa({ capa });
    return res.status(201).json({ success: true, data: capa });
  } catch (error) {
    console.error("createFormalCAPA error", error);
    return res.status(500).json({ success: false, error: "Failed to create formal CAPA" });
  }
};

export const assignCAPAOwner = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    const newOwnerId = toObjectId(req.body?.ownerUserId);
    const ownerChanged = newOwnerId && String(newOwnerId) !== String(capa.ownerUserId || "");
    capa.ownerUserId = newOwnerId || capa.ownerUserId;
    capa.ownerRole = req.body?.ownerRole || capa.ownerRole;
    capa.updatedBy = req.user?._id || null;
    await capa.save();

    if (ownerChanged && capa.ownerUserId) {
      notifyUsers({
        tenantId: tenantOrgId,
        userIds: [capa.ownerUserId],
        eventKey: "CAPA_ASSIGNED",
        payload: {
          capaId: capa._id,
          capaNumber: capa.capaNumber,
          ownerRole: capa.ownerRole,
          status: capa.status,
        },
      }).catch((e) => console.error("notifyUsers(CAPA_ASSIGNED) failed:", e?.message));
    }

    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("assignCAPAOwner error", error);
    return res.status(500).json({ success: false, error: "Failed to assign CAPA owner" });
  }
};

export const saveInvestigation = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const investigation = await CapaInvestigation.findOneAndUpdate(
      withTenantFilter(req, { capaId: capa._id }),
      {
        tenantOrgId,
        capaId: capa._id,
        ...req.body,
        updatedBy: req.user?._id || null,
        createdBy: req.user?._id || null,
      },
      { upsert: true, new: true }
    );

    if (capa.status === "CAPA_OPEN") {
      await transitionCapaStatus({
        capa,
        toStatus: "INVESTIGATION_IN_PROGRESS",
        reason: "Investigation captured",
        req,
      });
    }
    return res.json({ success: true, data: investigation });
  } catch (error) {
    console.error("saveInvestigation error", error);
    return res.status(500).json({ success: false, error: "Failed to save investigation" });
  }
};

export const saveRootCauseAnalysis = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const rootCause = await CapaRootCause.findOneAndUpdate(
      withTenantFilter(req, { capaId: capa._id }),
      {
        tenantOrgId,
        capaId: capa._id,
        ...req.body,
        updatedBy: req.user?._id || null,
        createdBy: req.user?._id || null,
      },
      { upsert: true, new: true }
    );
    await transitionCapaStatus({
      capa,
      toStatus: "RCA_PENDING_APPROVAL",
      reason: "RCA submitted",
      req,
    });
    return res.json({ success: true, data: rootCause });
  } catch (error) {
    console.error("saveRootCauseAnalysis error", error);
    return res.status(500).json({ success: false, error: "Failed to save root cause analysis" });
  }
};

export const saveActionPlan = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const actionPlan = await CapaActionPlan.findOneAndUpdate(
      withTenantFilter(req, { capaId: capa._id }),
      {
        tenantOrgId,
        capaId: capa._id,
        ...req.body,
        updatedBy: req.user?._id || null,
        createdBy: req.user?._id || null,
      },
      { upsert: true, new: true }
    );
    await transitionCapaStatus({
      capa,
      toStatus: "ACTION_PLAN_PENDING_APPROVAL",
      reason: "Action plan submitted",
      req,
    });
    return res.json({ success: true, data: actionPlan });
  } catch (error) {
    console.error("saveActionPlan error", error);
    return res.status(500).json({ success: false, error: "Failed to save action plan" });
  }
};

export const addActionItem = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    if (!req.body?.description) {
      return res.status(400).json({ success: false, error: "description is required" });
    }
    const actionPlan = await CapaActionPlan.findOne(withTenantFilter(req, { capaId: capa._id }))
      .select("_id")
      .lean();
    const actionItem = await CapaActionItem.create({
      tenantOrgId,
      capaId: capa._id,
      actionPlanId: actionPlan?._id || null,
      actionType: req.body?.actionType || "CORRECTIVE",
      description: req.body.description,
      ownerUserId: toObjectId(req.body?.ownerUserId),
      ownerRole: req.body?.ownerRole || "supplier_quality_lead",
      dueDate: req.body?.dueDate || null,
      completionEvidenceRequired:
        req.body?.completionEvidenceRequired === undefined
          ? true
          : Boolean(req.body.completionEvidenceRequired),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    return res.status(201).json({ success: true, data: actionItem });
  } catch (error) {
    console.error("addActionItem error", error);
    return res.status(500).json({ success: false, error: "Failed to add action item" });
  }
};

export const updateActionItemStatus = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { actionItemId } = req.params;
    const actionItem = await CapaActionItem.findOne(withTenantFilter(req, { _id: actionItemId }));
    if (!actionItem) return res.status(404).json({ success: false, error: "Action item not found" });
    actionItem.status = req.body?.status || actionItem.status;
    actionItem.completionNote = req.body?.completionNote || actionItem.completionNote;
    if (actionItem.status === "COMPLETED") {
      actionItem.completedAt = new Date();
      actionItem.completedBy = req.user?._id || null;
    }
    actionItem.updatedBy = req.user?._id || null;
    await actionItem.save();

    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: actionItem.capaId }));
    if (capa) {
      const allItems = await CapaActionItem.find(withTenantFilter(req, { capaId: capa._id }))
        .select("status")
        .lean();
      const allDone = allItems.length > 0 && allItems.every((item) => item.status === "COMPLETED");
      if (allDone && capa.status === "IN_IMPLEMENTATION") {
        await transitionCapaStatus({
          capa,
          toStatus: "AWAITING_EFFECTIVENESS_CHECK",
          reason: "All action items completed",
          req,
        });
      }
      await createMetricSnapshot(capa);
    }
    return res.json({ success: true, data: actionItem });
  } catch (error) {
    console.error("updateActionItemStatus error", error);
    return res.status(500).json({ success: false, error: "Failed to update action item status" });
  }
};

export const uploadImplementationEvidence = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const evidence = await CapaImplementationEvidence.create({
      tenantOrgId,
      capaId: capa._id,
      actionItemId: toObjectId(req.body?.actionItemId),
      evidenceType: req.body?.evidenceType || "DOCUMENT",
      documentId: toObjectId(req.body?.documentId),
      documentName: req.body?.documentName || "",
      url: req.body?.url || "",
      note: req.body?.note || "",
      uploadedBy: req.user?._id || null,
    });

    if (["ACTION_PLAN_APPROVED", "ACTION_PLAN_PENDING_APPROVAL", "CAPA_OPEN"].includes(capa.status)) {
      await transitionCapaStatus({
        capa,
        toStatus: "IN_IMPLEMENTATION",
        reason: "Implementation evidence uploaded",
        req,
      });
    }
    return res.status(201).json({ success: true, data: evidence });
  } catch (error) {
    console.error("uploadImplementationEvidence error", error);
    return res.status(500).json({ success: false, error: "Failed to upload implementation evidence" });
  }
};

export const saveEffectivenessCheck = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const result = String(req.body?.result || "PENDING");
    const check = await CapaEffectivenessCheck.findOneAndUpdate(
      withTenantFilter(req, { capaId: capa._id }),
      {
        tenantOrgId,
        capaId: capa._id,
        ...req.body,
        result,
        reviewedAt: result === "PENDING" ? null : new Date(),
        reviewedBy: result === "PENDING" ? null : req.user?._id || null,
        updatedBy: req.user?._id || null,
        createdBy: req.user?._id || null,
      },
      { upsert: true, new: true }
    );

    await transitionCapaStatus({
      capa,
      toStatus: "EFFECTIVENESS_REVIEW_IN_PROGRESS",
      reason: "Effectiveness review updated",
      req,
    });
    await createMetricSnapshot(capa);
    return res.json({ success: true, data: check });
  } catch (error) {
    console.error("saveEffectivenessCheck error", error);
    return res.status(500).json({ success: false, error: "Failed to save effectiveness check" });
  }
};

export const approveCAPAStage = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const stage = String(req.body?.stage || "");
    const decision = String(req.body?.decision || "");
    if (!CAPA_V2_APPROVAL_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: "Invalid approval stage" });
    }
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const approval = await CapaApproval.create({
      tenantOrgId,
      capaId: capa._id,
      stage,
      decision,
      note: req.body?.note || "",
      approverUserId: req.user?._id || null,
      approverRole: req.user?.role || "",
      createdBy: req.user?._id || null,
    });

    if (decision === "APPROVED") {
      if (stage === "RCA") {
        await transitionCapaStatus({
          capa,
          toStatus: "ACTION_PLAN_PENDING_APPROVAL",
          reason: "RCA approved",
          req,
        });
      } else if (stage === "ACTION_PLAN") {
        await transitionCapaStatus({
          capa,
          toStatus: "ACTION_PLAN_APPROVED",
          reason: "Action plan approved",
          req,
        });
      } else if (stage === "EFFECTIVENESS") {
        const check = await CapaEffectivenessCheck.findOne(withTenantFilter(req, { capaId: capa._id })).lean();
        const nextStatus = check?.result === "PASS" ? "CLOSED_EFFECTIVE" : "CLOSED_INEFFECTIVE";
        capa.closureOutcome = check?.result === "PASS" ? "EFFECTIVE" : "INEFFECTIVE";
        await transitionCapaStatus({
          capa,
          toStatus: nextStatus,
          reason: "Effectiveness stage approved",
          req,
        });
      } else if (stage === "TRIAGE" && capa.status === "UNDER_TRIAGE") {
        await transitionCapaStatus({
          capa,
          toStatus: "CAPA_OPEN",
          reason: "Triage approved",
          req,
        });
      }
    }

    return res.status(201).json({ success: true, data: approval });
  } catch (error) {
    console.error("approveCAPAStage error", error);
    return res.status(500).json({ success: false, error: "Failed to approve CAPA stage" });
  }
};

export const closeCAPA = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    const outcome = String(req.body?.outcome || "EFFECTIVE").toUpperCase();
    capa.closureOutcome = outcome === "INEFFECTIVE" ? "INEFFECTIVE" : "EFFECTIVE";
    capa.closedAt = new Date();
    const nextStatus = outcome === "INEFFECTIVE" ? "CLOSED_INEFFECTIVE" : "CLOSED_EFFECTIVE";
    await transitionCapaStatus({
      capa,
      toStatus: nextStatus,
      reason: req.body?.reason || "Closed by user",
      req,
      metadata: { closeOutcome: capa.closureOutcome },
    });
    await createMetricSnapshot(capa);
    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("closeCAPA error", error);
    return res.status(500).json({ success: false, error: "Failed to close CAPA" });
  }
};

export const reopenCAPA = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    await transitionCapaStatus({
      capa,
      toStatus: "REOPENED",
      reason: req.body?.reason || "Reopened by user",
      req,
    });
    capa.closedAt = null;
    capa.closureOutcome = null;
    await capa.save();
    await createMetricSnapshot(capa);
    return res.json({ success: true, data: capa });
  } catch (error) {
    console.error("reopenCAPA error", error);
    return res.status(500).json({ success: false, error: "Failed to reopen CAPA" });
  }
};

export const getRelatedFindingsAndPastCAPAs = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId })).lean();
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const [links, sourceLinks, legacy] = await Promise.all([
      CapaSimilarityLink.find(withTenantFilter(req, { capaId: capa._id })).lean(),
      CapaSourceLink.find(withTenantFilter(req, { capaId: capa._id })).lean(),
      LegacyCapa.find(
        withTenantFilter(req, {
          supplierId: capa.supplierId || null,
          siteId: capa.siteId || null,
        })
      )
        .select("_id title status severity targetDate auditId")
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        capa,
        similarityLinks: links,
        sourceLinks,
        pastCapasLegacy: legacy,
      },
    });
  } catch (error) {
    console.error("getRelatedFindingsAndPastCAPAs error", error);
    return res.status(500).json({ success: false, error: "Failed to load related findings and CAPAs" });
  }
};

export const getCAPADashboard = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const filter = applyPersonaScope(req, withTenantFilter(req, {}));
    const [capas, candidates, overdueActionItems] = await Promise.all([
      CapaV2.find(filter).select("status severity supplierId siteId createdAt dueDate closedAt recurrenceFlag").lean(),
      CapaCandidate.find(applyPersonaScope(req, withTenantFilter(req, {})))
        .select("status severitySuggestion recurrenceFlag createdAt")
        .lean(),
      CapaActionItem.find(
        applyPersonaScope(
          req,
          withTenantFilter(req, {
            dueDate: { $lt: new Date() },
            status: { $nin: ["COMPLETED", "CANCELLED"] },
          })
        )
      )
        .select("_id capaId dueDate status ownerUserId")
        .lean(),
    ]);

    const counts = {
      open: capas.filter((item) => !String(item.status || "").startsWith("CLOSED_")).length,
      closedEffective: capas.filter((item) => item.status === "CLOSED_EFFECTIVE").length,
      closedIneffective: capas.filter((item) => item.status === "CLOSED_INEFFECTIVE").length,
      reopened: capas.filter((item) => item.status === "REOPENED").length,
      overdue: capas.filter((item) => item.dueDate && new Date(item.dueDate).getTime() < Date.now()).length,
      recurring: capas.filter((item) => item.recurrenceFlag).length,
      candidateNew: candidates.filter((item) => item.status === "NEW").length,
      candidateInReview: candidates.filter((item) => item.status === "IN_REVIEW").length,
      overdueActionItems: overdueActionItems.length,
    };

    const bySeverity = capas.reduce((acc, item) => {
      const key = String(item.severity || "MEDIUM");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byStatus = capas.reduce((acc, item) => {
      const key = String(item.status || "UNKNOWN");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    capas.forEach((item) => {
      const ageDays = Math.max(
        0,
        Math.floor((Date.now() - new Date(item.createdAt || Date.now()).getTime()) / (24 * 60 * 60 * 1000))
      );
      if (ageDays <= 30) aging["0-30"] += 1;
      else if (ageDays <= 60) aging["31-60"] += 1;
      else if (ageDays <= 90) aging["61-90"] += 1;
      else aging["90+"] += 1;
    });

    return res.json({
      success: true,
      data: {
        counts,
        bySeverity,
        byStatus,
        aging,
        topOverdueActionItems: overdueActionItems.slice(0, 20),
      },
    });
  } catch (error) {
    console.error("getCAPADashboard error", error);
    return res.status(500).json({ success: false, error: "Failed to load CAPA dashboard" });
  }
};

export const getCapaList = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 20)));
    const skip = (page - 1) * pageSize;
    const queryFilters = [];

    if (req.query.status) queryFilters.push({ status: String(req.query.status) });
    if (req.query.severity) queryFilters.push({ severity: String(req.query.severity) });
    if (req.query.classification) queryFilters.push({ classification: String(req.query.classification) });
    if (req.query.auditId) queryFilters.push({ auditId: toObjectId(req.query.auditId) });
    if (req.query.supplierId) queryFilters.push({ supplierId: toObjectId(req.query.supplierId) });
    if (req.query.siteId) queryFilters.push({ siteId: toObjectId(req.query.siteId) });
    if (req.query.ownerUserId) queryFilters.push({ ownerUserId: toObjectId(req.query.ownerUserId) });
    if (req.query.search) {
      const value = String(req.query.search).trim();
      queryFilters.push({
        $or: [{ capaNumber: { $regex: value, $options: "i" } }, { title: { $regex: value, $options: "i" } }],
      });
    }

    const filter = buildScopedFilter(
      req,
      queryFilters.length === 1 ? queryFilters[0] : queryFilters.length > 1 ? { $and: queryFilters } : {}
    );

    const [rows, total] = await Promise.all([
      CapaV2.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select("capaNumber title status severity classification dueDate ownerUserId ownerRole auditId supplierId siteId updatedAt")
        .lean(),
      CapaV2.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: { rows, total, page, pageSize },
    });
  } catch (error) {
    console.error("getCapaList error", error);
    return res.status(500).json({ success: false, error: "Failed to load CAPA list" });
  }
};

export const getCapaDetail = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const scope = applyPersonaScope(req, withTenantFilter(req, { _id: capaId }));
    const capa = await CapaV2.findOne(scope).lean();
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const [intake, triage, investigation, rootCause, actionPlan, actionItems, evidence, effectiveness, approvals, comments, statusHistory, riskAssessments, sourceLinks, similarityLinks] =
      await Promise.all([
        CapaIntake.findOne(withTenantFilter(req, { _id: capa.sourceIntakeId || null })).lean(),
        CapaTriage.findOne(withTenantFilter(req, { _id: capa.sourceTriageId || null })).lean(),
        CapaInvestigation.findOne(withTenantFilter(req, { capaId: capa._id })).lean(),
        CapaRootCause.findOne(withTenantFilter(req, { capaId: capa._id })).lean(),
        CapaActionPlan.findOne(withTenantFilter(req, { capaId: capa._id })).lean(),
        CapaActionItem.find(withTenantFilter(req, { capaId: capa._id })).sort({ dueDate: 1, createdAt: -1 }).lean(),
        CapaImplementationEvidence.find(withTenantFilter(req, { capaId: capa._id })).sort({ createdAt: -1 }).lean(),
        CapaEffectivenessCheck.findOne(withTenantFilter(req, { capaId: capa._id })).lean(),
        CapaApproval.find(withTenantFilter(req, { capaId: capa._id })).sort({ createdAt: -1 }).lean(),
        CapaComment.find(withTenantFilter(req, { capaId: capa._id })).sort({ createdAt: -1 }).lean(),
        CapaStatusHistory.find(withTenantFilter(req, { capaId: capa._id })).sort({ createdAt: -1 }).lean(),
        CapaRiskAssessment.find(withTenantFilter(req, { capaId: capa._id })).sort({ createdAt: -1 }).lean(),
        CapaSourceLink.find(withTenantFilter(req, { capaId: capa._id })).sort({ createdAt: -1 }).lean(),
        CapaSimilarityLink.find(withTenantFilter(req, { capaId: capa._id })).sort({ similarityScore: -1 }).lean(),
      ]);

    return res.json({
      success: true,
      data: {
        capa,
        intake,
        triage,
        investigation,
        rootCause,
        actionPlan,
        actionItems,
        implementationEvidence: evidence,
        effectivenessCheck: effectiveness,
        approvals,
        comments,
        statusHistory,
        riskAssessments,
        sourceLinks,
        similarityLinks,
      },
    });
  } catch (error) {
    console.error("getCapaDetail error", error);
    return res.status(500).json({ success: false, error: "Failed to load CAPA detail" });
  }
};

export const addCapaComment = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(applyPersonaScope(req, withTenantFilter(req, { _id: capaId }))).lean();
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ success: false, error: "message is required" });

    const comment = await CapaComment.create({
      tenantOrgId,
      capaId: capa._id,
      stage: req.body?.stage || "INVESTIGATION",
      visibility: req.body?.visibility || "INTERNAL",
      message,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      createdBy: req.user?._id,
      createdByRole: req.user?.role || "",
    });

    return res.status(201).json({ success: true, data: comment });
  } catch (error) {
    console.error("addCapaComment error", error);
    return res.status(500).json({ success: false, error: "Failed to add CAPA comment" });
  }
};

export const saveRiskAssessment = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(applyPersonaScope(req, withTenantFilter(req, { _id: capaId })));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });

    const riskLevel = String(req.body?.riskLevel || capa.riskLevel || "MEDIUM").toUpperCase();
    const assessment = await CapaRiskAssessment.create({
      tenantOrgId,
      capaId: capa._id,
      riskScore: Number(req.body?.riskScore || 0),
      riskLevel,
      patientImpact: req.body?.patientImpact || "",
      productImpact: req.body?.productImpact || "",
      complianceImpact: req.body?.complianceImpact || "",
      recurrenceRisk: req.body?.recurrenceRisk || "",
      rationale: req.body?.rationale || "",
      assessedBy: req.user?._id || null,
      assessedAt: new Date(),
    });

    capa.riskLevel = riskLevel;
    capa.updatedBy = req.user?._id || null;
    await capa.save();
    await createMetricSnapshot(capa);
    return res.status(201).json({ success: true, data: assessment });
  } catch (error) {
    console.error("saveRiskAssessment error", error);
    return res.status(500).json({ success: false, error: "Failed to save CAPA risk assessment" });
  }
};

export const getCapaModuleHealth = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const filter = applyPersonaScope(req, withTenantFilter(req, {}));
    const [totalCandidates, totalCapas, statusStats, staleCandidates] = await Promise.all([
      CapaCandidate.countDocuments(filter),
      CapaV2.countDocuments(filter),
      CapaV2.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      CapaCandidate.countDocuments({
        ...filter,
        status: { $in: ["NEW", "IN_REVIEW"] },
        createdAt: { $lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      }),
    ]);
    return res.json({
      success: true,
      data: {
        totalCandidates,
        totalCapas,
        staleCandidates,
        statusStats,
      },
    });
  } catch (error) {
    console.error("getCapaModuleHealth error", error);
    return res.status(500).json({ success: false, error: "Failed to load CAPA module health" });
  }
};

export const linkLegacyCapasToV2 = async (req, res) => {
  try {
    const tenantOrgId = ensureTenant(req, res);
    if (!tenantOrgId) return;
    const { capaId } = req.params;
    const capa = await CapaV2.findOne(withTenantFilter(req, { _id: capaId }));
    if (!capa) return res.status(404).json({ success: false, error: "CAPA not found" });
    const legacyIds = Array.isArray(req.body?.legacyCapaIds) ? req.body.legacyCapaIds : [];
    if (!legacyIds.length) {
      return res.status(400).json({ success: false, error: "legacyCapaIds is required" });
    }
    const legacyCapas = await LegacyCapa.find({
      _id: { $in: legacyIds.map((item) => toObjectId(item)).filter(Boolean) },
      tenantOrgId,
    })
      .select("_id title status severity auditId")
      .lean();

    const links = legacyCapas.map((legacy) => ({
      tenantOrgId,
      capaId: capa._id,
      sourceType: "MANUAL",
      sourceRecordType: "legacy_capa",
      sourceRecordId: String(legacy._id),
      auditId: legacy.auditId || null,
      snippet: `Legacy CAPA ${legacy.title || legacy._id}`,
      confidence: 1,
      autoFillStatus: "exact_match",
      createdBy: req.user?._id || null,
    }));
    if (links.length) {
      await CapaSourceLink.insertMany(links, { ordered: false });
    }

    return res.json({
      success: true,
      data: { linkedCount: links.length, legacyCapas },
    });
  } catch (error) {
    console.error("linkLegacyCapasToV2 error", error);
    return res.status(500).json({ success: false, error: "Failed to link legacy CAPAs" });
  }
};
