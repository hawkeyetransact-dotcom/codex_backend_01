import crypto from "crypto";
import { AuditRequestMaster } from "../../models/auditRequestsMasterModel.js";
import { AuditQuestions } from "../../models/auditQuestionsModels.js";
import { ComplianceResponseSnapshot } from "../../models/complianceResponseSnapshotModel.js";
import { ComplianceRun } from "../../models/complianceRunModel.js";
import { ComplianceQuestionResult } from "../../models/complianceQuestionResultModel.js";
import { DigiLockerService } from "../digilocker/digilockerService.js";
import { StandardRegistryService } from "./standardRegistryService.js";
import { ComplianceGuidelineVectorService } from "./complianceGuidelineVectorService.js";
import {
  evaluateQuestionCompliance,
  mapControlsForQuestion,
  normalizeYesNo,
  pickRegulatoryReference,
  summarizeVerdicts,
} from "./complianceRules.js";

const splitDocUrls = (value = "") =>
  String(value || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

const stringifyRefs = (value = []) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const standard = String(item.standard || "").trim();
      const section = String(item.section || "").trim();
      const title = String(item.title || "").trim();
      return [standard, section, title].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean);
};

const buildSnapshotQuestions = (auditQuestions = []) =>
  (Array.isArray(auditQuestions) ? auditQuestions : []).map((q) => {
    const autoFillSources = Array.isArray(q?.autoFillMeta?.sources)
      ? q.autoFillMeta.sources.filter(Boolean).map((item) => String(item))
      : [];
    const docUrls = splitDocUrls(q.docUrls || "");
    return {
      questionId: String(q._id),
      questionCode: String(q.questionCode || ""),
      question: String(q.question || ""),
      categoryName: String(q.categoryName || ""),
      cfrReference: String(q.cfrReference || ""),
      regulatoryReferences: stringifyRefs(q.regulatoryReferences),
      response: {
        yesNo: normalizeYesNo(q.YesNoAnswers),
        text: String(q.textResponse || "").trim(),
        responseDetails:
          q.responseDetails && typeof q.responseDetails === "object" ? q.responseDetails : {},
        docUrls,
        autoFillSources,
        updatedAt: q.updatedAt || null,
      },
    };
  });

const countAnswered = (snapshotQuestions = []) =>
  snapshotQuestions.reduce((acc, q) => {
    const yesNo = String(q?.response?.yesNo || "").trim();
    const text = String(q?.response?.text || "").trim();
    const details =
      q?.response?.responseDetails && typeof q.response.responseDetails === "object"
        ? Object.keys(q.response.responseDetails).length
        : 0;
    const docCount = Array.isArray(q?.response?.docUrls) ? q.response.docUrls.length : 0;
    return acc + (yesNo || text || details || docCount ? 1 : 0);
  }, 0);

const buildSnapshotHash = (snapshotQuestions = [], standardKey = "", standardVersion = "") =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify({ standardKey, standardVersion, snapshotQuestions }))
    .digest("hex");

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const keepLatestSuggestionPerDocument = (items = []) => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = String(item.documentId || "");
    if (!key) return;
    const current = map.get(key);
    const nextEffective = toDate(item.effectiveDate);
    const currentEffective = toDate(current?.effectiveDate);
    if (!current) {
      map.set(key, item);
      return;
    }
    if (nextEffective && currentEffective && nextEffective > currentEffective) {
      map.set(key, item);
      return;
    }
    if (nextEffective && !currentEffective) {
      map.set(key, item);
      return;
    }
    if (!nextEffective && !currentEffective) {
      if (Number(item.confidence || 0) > Number(current.confidence || 0)) {
        map.set(key, item);
      }
    }
  });
  return Array.from(map.values())
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
    .slice(0, 3);
};

const summarizeWithOverrides = (items = []) =>
  summarizeVerdicts(
    (Array.isArray(items) ? items : []).map((item) => ({
      machineVerdict: item.finalVerdict || item.machineVerdict,
    }))
  );

const resolveMappedControlsAndGuidelineHits = ({
  snapshotQuestion,
  standardControls = [],
  guidelineVectors = [],
}) => {
  const questionPayload = {
    questionText: snapshotQuestion.question,
    categoryName: snapshotQuestion.categoryName,
    cfrReference: snapshotQuestion.cfrReference,
    regulatoryReferences: snapshotQuestion.regulatoryReferences,
  };

  const keywordMappedControls = mapControlsForQuestion(questionPayload, standardControls);
  const guidelineHits = ComplianceGuidelineVectorService.findTopMatchesForQuestion({
    vectors: guidelineVectors,
    questionText: snapshotQuestion.question,
    categoryName: snapshotQuestion.categoryName,
    regulatoryReference: pickRegulatoryReference({
      cfrReference: snapshotQuestion.cfrReference,
      regulatoryReferences: snapshotQuestion.regulatoryReferences,
    }),
    limit: 4,
  });

  const mappedControls = ComplianceGuidelineVectorService.mergeMappedControlsWithGuidelineHits({
    mappedControls: keywordMappedControls,
    guidelineHits,
    limit: 3,
  });

  return { mappedControls, guidelineHits };
};

const resolveRunQuestionResultPayload = ({
  tenantId,
  runId,
  auditId,
  snapshotQuestion,
  standardControls,
  guidelineVectors = [],
}) => {
  const { mappedControls, guidelineHits } = resolveMappedControlsAndGuidelineHits({
    snapshotQuestion,
    standardControls,
    guidelineVectors,
  });

  const response = snapshotQuestion.response || {};
  const hasEvidence =
    (Array.isArray(response.docUrls) && response.docUrls.length > 0) ||
    (Array.isArray(response.autoFillSources) && response.autoFillSources.length > 0);
  const evaluation = evaluateQuestionCompliance({
    response: {
      yesNo: response.yesNo,
      text: response.text,
      responseDetails: response.responseDetails || {},
      hasEvidence,
    },
    mappedControls,
  });

  return {
    tenantId,
    runId,
    auditId,
    questionId: snapshotQuestion.questionId,
    questionCode: snapshotQuestion.questionCode || "",
    questionText: snapshotQuestion.question || "",
    categoryName: snapshotQuestion.categoryName || "",
    regulatoryReference:
      snapshotQuestion.cfrReference ||
      pickRegulatoryReference({
        cfrReference: snapshotQuestion.cfrReference,
        regulatoryReferences: snapshotQuestion.regulatoryReferences,
      }),
    mappedControls: mappedControls.map((item) => ({
      controlId: item.controlId,
      title: item.title,
      clauseRef: item.clauseRef,
      standardRefs: item.standardRefs,
      score: item.score,
    })),
    response: {
      yesNo: response.yesNo || "",
      text: response.text || "",
      hasEvidence,
      evidenceSources: [
        ...(Array.isArray(response.autoFillSources) ? response.autoFillSources : []),
        ...(Array.isArray(response.docUrls) ? response.docUrls : []),
      ].slice(0, 8),
      responseDetails:
        response.responseDetails && typeof response.responseDetails === "object"
          ? response.responseDetails
          : {},
    },
    machineVerdict: evaluation.verdict,
    machineConfidence: evaluation.confidence,
    machineReason: evaluation.reason,
    reviewStatus: "OPEN",
    evidenceSuggestions: [],
    guidelineMatches: guidelineHits.map((item) => ({
      chunkId: item.chunkId,
      documentId: item.documentId,
      documentName: item.documentName,
      score: item.score,
      snippet: item.snippet,
      clauseRef: item.clauseRef,
      standardRefs: item.standardRefs,
      controlId: item.controlId,
      title: item.title,
      sourceType: item.sourceType,
    })),
  };
};

const loadAuditAndQuestions = async ({ auditId }) => {
  const audit = await AuditRequestMaster.findById(auditId).lean();
  if (!audit) {
    const err = new Error("Audit not found");
    err.status = 404;
    throw err;
  }
  const questions = await AuditQuestions.find({ auditRequestId: auditId }).lean();
  if (!questions.length) {
    const err = new Error("No execution questionnaire responses found for audit");
    err.status = 404;
    throw err;
  }
  return { audit, questions };
};

export const ComplianceEvaluationService = {
  async listRuns({ tenantId, auditId, page = 1, pageSize = 20 }) {
    const query = { tenantId };
    if (auditId) query.auditId = auditId;
    const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
    const [items, total] = await Promise.all([
      ComplianceRun.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      ComplianceRun.countDocuments(query),
    ]);
    return {
      items,
      total,
      page: Math.max(1, Number(page) || 1),
      pageSize: limit,
    };
  },

  async getRun({ tenantId, runId }) {
    return ComplianceRun.findOne({ _id: runId, tenantId }).lean();
  },

  async createRun({
    tenantId,
    auditId,
    standardKey,
    standardVersion,
    mode = "ADVISORY",
    actorUserId,
  }) {
    await StandardRegistryService.ensureDefaults({ tenantId, actorUserId });
    const standard = await StandardRegistryService.getStandard({
      tenantId,
      standardKey,
      version: standardVersion,
      actorUserId,
    });
    if (!standard) {
      const err = new Error("Compliance standard/version not found");
      err.status = 404;
      throw err;
    }

    await ComplianceGuidelineVectorService.ensureGuidelineVectorsReady({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      actorUserId,
    });
    const guidelineVectors = await ComplianceGuidelineVectorService.loadActiveVectors({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
    });

    const { audit, questions } = await loadAuditAndQuestions({ auditId });
    const snapshotQuestions = buildSnapshotQuestions(questions);
    const snapshotHash = buildSnapshotHash(
      snapshotQuestions,
      standard.standardKey,
      standard.version
    );

    const snapshot = await ComplianceResponseSnapshot.create({
      tenantId,
      auditId,
      source: "LIVE",
      snapshotHash,
      totalQuestions: snapshotQuestions.length,
      answeredQuestions: countAnswered(snapshotQuestions),
      questions: snapshotQuestions,
      createdBy: actorUserId || undefined,
    });

    const run = await ComplianceRun.create({
      tenantId,
      auditId,
      responseSnapshotId: snapshot._id,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      standardName: standard.name,
      mode: String(mode || "ADVISORY").toUpperCase() === "FINAL" ? "FINAL" : "ADVISORY",
      status: "RUNNING",
      engine: "RULES_V1",
      noCost: true,
      createdBy: actorUserId || undefined,
      startedAt: new Date(),
    });

    try {
      const docs = snapshotQuestions.map((snapshotQuestion) =>
        resolveRunQuestionResultPayload({
          tenantId,
          runId: run._id,
          auditId,
          snapshotQuestion,
          standardControls: standard.controls || [],
          guidelineVectors,
        })
      );

      if (docs.length) {
        await ComplianceQuestionResult.insertMany(docs, { ordered: false });
      }

      const summary = summarizeVerdicts(docs);
      run.summary = summary;
      run.status = "COMPLETED";
      run.completedAt = new Date();
      run.error = "";
      await run.save();

      return {
        run: run.toObject(),
        snapshot: {
          id: snapshot._id,
          totalQuestions: snapshot.totalQuestions,
          answeredQuestions: snapshot.answeredQuestions,
        },
        summary,
      };
    } catch (error) {
      run.status = "FAILED";
      run.error = error?.message || "Evaluation failed";
      run.completedAt = new Date();
      await run.save();
      throw error;
    }
  },

  async listRunQuestionResults({
    tenantId,
    runId,
    page = 1,
    pageSize = 25,
    verdict,
    reviewStatus,
  }) {
    const query = { tenantId, runId };
    if (verdict) query.machineVerdict = String(verdict).toUpperCase();
    if (reviewStatus) query.reviewStatus = String(reviewStatus).toUpperCase();

    const limit = Math.min(200, Math.max(1, Number(pageSize) || 25));
    const offset = (Math.max(1, Number(page) || 1) - 1) * limit;

    const [items, total] = await Promise.all([
      ComplianceQuestionResult.find(query)
        .sort({ categoryName: 1, questionCode: 1, createdAt: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      ComplianceQuestionResult.countDocuments(query),
    ]);

    return {
      items,
      total,
      page: Math.max(1, Number(page) || 1),
      pageSize: limit,
    };
  },

  async hydrateEvidenceSuggestions({ tenantId, runId, questionResults = [] }) {
    if (!Array.isArray(questionResults) || !questionResults.length) return questionResults;
    const run = await ComplianceRun.findOne({ _id: runId, tenantId }).lean();
    if (!run) return questionResults;
    const audit = await AuditRequestMaster.findById(run.auditId).lean();
    if (!audit) return questionResults;

    const patches = [];
    const hydrated = [];

    for (const item of questionResults) {
      try {
        const suggestionsRaw = await DigiLockerService.suggestEvidence({
          tenantId,
          supplierOrgId: audit.supplier_id,
          questionText: item.questionText || "",
          siteId: audit.site_id,
          productId: audit.supplier_product_id,
          limit: 8,
        });
        const latest = keepLatestSuggestionPerDocument(suggestionsRaw).map((entry) => ({
          documentId: String(entry.documentId || ""),
          versionId: String(entry.versionId || ""),
          title: String(entry.title || ""),
          confidence: Number(entry.confidence || 0),
          pageNumber: Number(entry.pageNumber || 1),
          effectiveDate: entry.effectiveDate || null,
          expiryDate: entry.expiryDate || null,
          source: "DigiLockerLatest",
        }));
        hydrated.push({ ...item, evidenceSuggestions: latest });
        patches.push({
          updateOne: {
            filter: { _id: item._id, tenantId },
            update: { $set: { evidenceSuggestions: latest } },
          },
        });
      } catch (error) {
        hydrated.push(item);
      }
    }

    if (patches.length) {
      await ComplianceQuestionResult.bulkWrite(patches, { ordered: false });
    }
    return hydrated;
  },

  async updateQuestionVerdict({
    tenantId,
    runId,
    questionId,
    auditorVerdict,
    auditorReason,
    actorUserId,
  }) {
    const run = await ComplianceRun.findOne({ _id: runId, tenantId });
    if (!run) {
      const err = new Error("Compliance run not found");
      err.status = 404;
      throw err;
    }
    if (run.status === "FINALIZED") {
      const err = new Error("Compliance run already finalized");
      err.status = 409;
      throw err;
    }

    const result = await ComplianceQuestionResult.findOne({
      tenantId,
      runId,
      questionId: String(questionId),
    });
    if (!result) {
      const err = new Error("Question result not found");
      err.status = 404;
      throw err;
    }

    result.auditorVerdict = String(auditorVerdict || "").toUpperCase();
    result.auditorReason = String(auditorReason || "").trim();
    result.finalVerdict = result.auditorVerdict || result.finalVerdict;
    result.reviewStatus = "REVIEWED";
    result.updatedBy = actorUserId || undefined;
    await result.save();

    const all = await ComplianceQuestionResult.find({ tenantId, runId }).lean();
    run.summary = summarizeWithOverrides(all);
    await run.save();

    return result.toObject();
  },

  async finalizeRun({ tenantId, runId, actorUserId }) {
    const run = await ComplianceRun.findOne({ _id: runId, tenantId });
    if (!run) {
      const err = new Error("Compliance run not found");
      err.status = 404;
      throw err;
    }

    const results = await ComplianceQuestionResult.find({ tenantId, runId });
    if (!results.length) {
      const err = new Error("No compliance question results found");
      err.status = 404;
      throw err;
    }

    const updates = [];
    const auditQuestionUpdates = [];
    const finalizedResults = [];
    for (const item of results) {
      const finalVerdict = item.auditorVerdict || item.machineVerdict;
      const nextReviewStatus = item.auditorVerdict ? "REVIEWED" : item.reviewStatus;
      updates.push({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: {
              finalVerdict,
              reviewStatus: nextReviewStatus,
              updatedBy: actorUserId || undefined,
            },
          },
        },
      });
      finalizedResults.push({ ...item.toObject(), finalVerdict });

      if (finalVerdict === "COMPLIANT" || finalVerdict === "NON_COMPLIANT" || finalVerdict === "INSUFFICIENT") {
        auditQuestionUpdates.push({
          updateOne: {
            filter: { _id: item.questionId, auditRequestId: run.auditId },
            update: {
              $set: {
                isComplient: finalVerdict === "COMPLIANT" ? "Yes" : "No",
              },
            },
          },
        });
      }
    }

    if (updates.length) {
      await ComplianceQuestionResult.bulkWrite(updates, { ordered: false });
    }
    if (auditQuestionUpdates.length) {
      await AuditQuestions.bulkWrite(auditQuestionUpdates, { ordered: false });
    }

    const summary = summarizeVerdicts(finalizedResults, true);
    run.summary = summary;
    run.status = "FINALIZED";
    run.finalizedAt = new Date();
    run.finalizedBy = actorUserId || undefined;
    if (!run.completedAt) run.completedAt = new Date();
    run.error = "";
    await run.save();

    return { run: run.toObject(), summary };
  },

  async recomputeRun({
    tenantId,
    runId,
    actorUserId,
    refreshSnapshot = false,
    preserveAuditorOverrides = true,
  }) {
    const run = await ComplianceRun.findOne({ _id: runId, tenantId });
    if (!run) {
      const err = new Error("Compliance run not found");
      err.status = 404;
      throw err;
    }
    const standard = await StandardRegistryService.getStandard({
      tenantId,
      standardKey: run.standardKey,
      version: run.standardVersion,
      actorUserId,
    });
    if (!standard) {
      const err = new Error("Compliance standard/version not found");
      err.status = 404;
      throw err;
    }

    await ComplianceGuidelineVectorService.ensureGuidelineVectorsReady({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
      actorUserId,
    });
    const guidelineVectors = await ComplianceGuidelineVectorService.loadActiveVectors({
      tenantId,
      standardKey: standard.standardKey,
      standardVersion: standard.version,
    });

    let snapshot = await ComplianceResponseSnapshot.findOne({
      _id: run.responseSnapshotId,
      tenantId,
    });

    if (!snapshot || refreshSnapshot) {
      const { questions } = await loadAuditAndQuestions({ auditId: run.auditId });
      const snapshotQuestions = buildSnapshotQuestions(questions);
      const snapshotHash = buildSnapshotHash(
        snapshotQuestions,
        run.standardKey,
        run.standardVersion
      );
      snapshot = await ComplianceResponseSnapshot.create({
        tenantId,
        auditId: run.auditId,
        source: "LIVE",
        snapshotHash,
        totalQuestions: snapshotQuestions.length,
        answeredQuestions: countAnswered(snapshotQuestions),
        questions: snapshotQuestions,
        createdBy: actorUserId || undefined,
      });
      run.responseSnapshotId = snapshot._id;
    }

    const previousResults = preserveAuditorOverrides
      ? await ComplianceQuestionResult.find({ tenantId, runId }).lean()
      : [];
    const overrideByQuestionId = new Map(
      previousResults.map((item) => [
        String(item.questionId),
        {
          auditorVerdict: item.auditorVerdict || null,
          auditorReason: item.auditorReason || "",
          finalVerdict: item.finalVerdict || null,
          reviewStatus: item.reviewStatus || "OPEN",
        },
      ])
    );

    const nextDocs = (snapshot.questions || []).map((snapshotQuestion) => {
      const base = resolveRunQuestionResultPayload({
        tenantId,
        runId: run._id,
        auditId: run.auditId,
        snapshotQuestion,
        standardControls: standard.controls || [],
        guidelineVectors,
      });
      const override = overrideByQuestionId.get(String(snapshotQuestion.questionId));
      if (!override) return base;
      return {
        ...base,
        auditorVerdict: override.auditorVerdict,
        auditorReason: override.auditorReason,
        finalVerdict: override.finalVerdict || override.auditorVerdict || null,
        reviewStatus: override.reviewStatus || base.reviewStatus,
      };
    });

    await ComplianceQuestionResult.deleteMany({ tenantId, runId: run._id });
    if (nextDocs.length) {
      await ComplianceQuestionResult.insertMany(nextDocs, { ordered: false });
    }

    run.summary = summarizeWithOverrides(nextDocs);
    run.status = "COMPLETED";
    run.startedAt = new Date();
    run.completedAt = new Date();
    run.finalizedAt = null;
    run.finalizedBy = null;
    run.error = "";
    await run.save();

    return { run: run.toObject(), summary: run.summary };
  },
};

