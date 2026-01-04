import cron from "node-cron";
import { runAll } from "../index.js";

let job = null;

export const startPublicIntelScheduler = () => {
  if (job || process.env.PUBLIC_INTEL_SCHEDULER_ENABLED !== "true") return;
  const cronExp = process.env.PUBLIC_INTEL_SYNC_CRON || "0 2 * * *";
  job = cron.schedule(
    cronExp,
    async () => {
      try {
        await runAll();
        // eslint-disable-next-line no-console
        console.log("[public-intel] scheduled sync completed");
      } catch (err) {
        console.error("[public-intel] scheduled sync failed", err.message);
      }
    },
    { timezone: process.env.PUBLIC_INTEL_CRON_TZ || undefined }
  );
};

export const stopPublicIntelScheduler = () => {
  if (job) {
    job.stop();
    job = null;
  }
};

