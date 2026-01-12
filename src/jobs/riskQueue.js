import { recalculateSupplierRisk } from "../services/risk/riskOrchestrator.js";

const queue = [];
let active = 0;
const concurrency = 2;
const maxRetries = 2;

const runNext = () => {
  if (active >= concurrency || queue.length === 0) return;
  const job = queue.shift();
  if (!job) return;
  active += 1;

  const runJob = async () => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const result = await recalculateSupplierRisk(job.payload);
        job.resolve(result);
        return;
      } catch (err) {
        attempt += 1;
        if (attempt > maxRetries) {
          job.reject(err);
          return;
        }
      }
    }
  };

  runJob()
    .catch((err) => job.reject(err))
    .finally(() => {
      active -= 1;
      runNext();
    });
};

export const enqueueRiskRecalc = (payload) => {
  return new Promise((resolve, reject) => {
    queue.push({ payload, resolve, reject });
    runNext();
  });
};

export const enqueueRiskRecalcBatch = (payloads) => {
  payloads.forEach((payload) => {
    enqueueRiskRecalc(payload).catch(() => undefined);
  });
  return payloads.length;
};
