import cron from "node-cron";
import { SupplierRiskMetrics } from "../models/SupplierRiskMetrics.js";
import { SupplierPublicSignal } from "../models/SupplierPublicSignal.js";
import { User } from "../models/userModel.js";
import { enqueueRiskRecalcBatch } from "./riskQueue.js";

let job = null;

const resolveSupplierIds = async (sinceDate, recalcAll) => {
  if (recalcAll) {
    const suppliers = await User.find({ role: "supplier" }).select("_id").lean();
    return suppliers.map((item) => item._id);
  }
  const [metrics, signals] = await Promise.all([
    SupplierRiskMetrics.find({ updatedAt: { $gte: sinceDate } }).select("supplierId").lean(),
    SupplierPublicSignal.find({ updatedAt: { $gte: sinceDate } }).select("supplierId").lean(),
  ]);
  const ids = new Set();
  metrics.forEach((item) => ids.add(String(item.supplierId)));
  signals.forEach((item) => ids.add(String(item.supplierId)));
  return Array.from(ids);
};

export const startRiskScheduler = () => {
  if (job || process.env.RISK_CRON_ENABLED !== "true") return;
  const cronExp = process.env.RISK_CRON || "30 2 * * *";
  const tz = process.env.RISK_CRON_TZ || undefined;

  job = cron.schedule(
    cronExp,
    async () => {
      try {
        const lookbackDays = Number(process.env.RISK_RECALC_LOOKBACK_DAYS || 7);
        const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
        const recalcAll = process.env.RISK_RECALC_ALL === "true";
        const supplierIds = await resolveSupplierIds(sinceDate, recalcAll);
        if (!supplierIds.length) return;
        const correlationId = `risk-cron-${Date.now()}`;
        const payloads = supplierIds.map((supplierId) => ({
          supplierId,
          eventType: "MANUAL_OVERRIDE",
          correlationId,
        }));
        enqueueRiskRecalcBatch(payloads);
      } catch (err) {
        console.error("[risk] scheduled recalc failed", err.message);
      }
    },
    { timezone: tz }
  );
};

export const stopRiskScheduler = () => {
  if (job) {
    job.stop();
    job = null;
  }
};
