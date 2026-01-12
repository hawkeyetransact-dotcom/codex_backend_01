import mongoose from "mongoose";
import { SupplierPublicSignal } from "../../models/SupplierPublicSignal.js";
import { SupplierRiskMetrics } from "../../models/SupplierRiskMetrics.js";
import { SupplierRiskSnapshot } from "../../models/SupplierRiskSnapshot.js";
import { SupplierRiskEvent } from "../../models/SupplierRiskEvent.js";
import { EvidenceFinding } from "../../models/EvidenceFinding.js";
import { SupplierNetworkLink } from "../../models/SupplierNetworkLink.js";
import { scoreV1 } from "./scoringV1.js";
import { scoreV2 } from "./scoringV2.js";
import { computeTrend } from "./trend.js";
import { computeEvidenceTrust } from "./evidenceTrust.js";
import { computeNetworkExposure } from "./networkExposure.js";
import { computeAuditorNormalization } from "./auditorNormalization.js";

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return new mongoose.Types.ObjectId(value);
};

const ensurePublicSignals = (doc) => ({
  fda483CountRecent24m: 0,
  warningLetterRecent24m: false,
  importAlertActive: false,
  inspectionsOpenCount: 0,
  recalls: [],
  sources: [],
  regionFlags: [],
  ...(doc ? doc.toObject?.() || doc : {}),
});

const ensureMetrics = (doc) => ({
  questionnaireOnTimeRate: 0,
  avgResponseHoursToFollowups: 0,
  capaOverdueCount: 0,
  capaReopenRate: 0,
  evidenceQualityScore: 0,
  docCompletenessScore: 0,
  ...(doc ? doc.toObject?.() || doc : {}),
});

const getLatestNeighborScores = async (supplierIds) => {
  const uniqueIds = Array.from(new Set(supplierIds.filter(Boolean).map(String)));
  if (!uniqueIds.length) return {};
  const snapshots = await SupplierRiskSnapshot.find({
    supplierId: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .sort({ calculatedAt: -1 })
    .lean();

  const map = {};
  snapshots.forEach((snap) => {
    const key = String(snap.supplierId);
    if (!map[key]) {
      map[key] = snap.finalScoreV2 ?? snap.finalScore ?? 0;
    }
  });
  return map;
};

export const recalculateSupplierRisk = async ({
  supplierId,
  actorUserId,
  eventType,
  correlationId,
  includeDebug = false,
} = {}) => {
  const supplierObjectId = toObjectId(supplierId);
  if (!supplierObjectId) throw new Error("supplierId is required");

  const [publicDoc, metricsDoc] = await Promise.all([
    SupplierPublicSignal.findOne({ supplierId: supplierObjectId }),
    SupplierRiskMetrics.findOne({ supplierId: supplierObjectId }),
  ]);

  const publicSignals = ensurePublicSignals(publicDoc);
  const metrics = ensureMetrics(metricsDoc);

  const v1 = scoreV1({ publicSignals, metrics });
  const riskModelVersion = process.env.RISK_MODEL_VERSION || "v1.0";
  let finalScoreV2;
  let v2Data;
  let v2Breakdown = {};

  if (process.env.RISK_V2_ENABLED === "true") {
    const recentSnapshots = await SupplierRiskSnapshot.find({ supplierId: supplierObjectId })
      .sort({ calculatedAt: -1 })
      .limit(6)
      .lean();
    const trend = computeTrend(recentSnapshots, v1.finalScore);

    const findings = await EvidenceFinding.find({ supplierId: supplierObjectId }).lean();
    const evidence = computeEvidenceTrust(findings);

    const links = await SupplierNetworkLink.find({ fromSupplierId: supplierObjectId }).lean();
    const neighborScores = await getLatestNeighborScores(links.map((link) => link.toSupplierId));
    const network = computeNetworkExposure({ links, neighborScores });

    const auditorNorm = computeAuditorNormalization();
    const v2Scores = scoreV2({
      baseScore: v1.finalScore,
      trend,
      evidenceTrustScore: evidence.score,
      networkExposureScore: network.score,
    });

    finalScoreV2 = v2Scores.finalScoreV2;
    v2Data = {
      riskTrendSlope: trend.riskTrendSlope,
      volatility: trend.volatility,
      earlyWarnings: trend.earlyWarnings,
      evidenceTrustScore: evidence.score,
      networkExposureScore: network.score,
      auditorBiasFactor: auditorNorm.auditorBiasFactor,
    };
    v2Breakdown = {
      evidenceTrust: evidence.score,
      networkExposure: network.score,
      trend: trend.trendScore,
    };
  }

  const snapshotPayload = {
    supplierId: supplierObjectId,
    riskModelVersion,
    calculatedAt: new Date(),
    baselineScore: v1.baselineScore,
    hawkeyeScore: v1.hawkeyeScore,
    finalScore: v1.finalScore,
    finalScoreV2,
    riskBand: v1.riskBand,
    breakdown: { ...v1.breakdown, ...v2Breakdown },
    reasons: v1.reasons,
    v2: v2Data,
    debug: includeDebug
      ? {
          ...v1.debug,
          exposurePaths: network.exposurePaths,
          evidenceReasons: evidence.reasons,
        }
      : undefined,
  };

  const snapshot = await SupplierRiskSnapshot.create(snapshotPayload);

  if (eventType) {
    await SupplierRiskEvent.create({
      supplierId: supplierObjectId,
      eventType,
      eventAt: new Date(),
      payload: { riskModelVersion, finalScore: v1.finalScore, finalScoreV2 },
      createdBy: actorUserId ? toObjectId(actorUserId) : undefined,
      correlationId,
    });
  }

  return snapshot.toObject();
};
