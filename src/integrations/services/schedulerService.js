import cron from "node-cron";
import { IntegrationConnection } from "../../models/integrationConnectionModel.js";
import { runSync } from "./ingestionService.js";

let job = null;

export const startIntegrationScheduler = () => {
  if (job) return job;
  const enabled = process.env.INTEGRATION_SCHEDULER_ENABLED !== "false";
  if (!enabled) {
    console.log("[integrations] scheduler disabled");
    return null;
  }

  job = cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const connections = await IntegrationConnection.find({
        status: "Active",
        "schedule.nextRunAt": { $lte: now },
      })
        .sort({ "schedule.nextRunAt": 1 })
        .limit(20);

      for (const connection of connections) {
        try {
          await runSync({ connectionId: connection._id, runType: "SCHEDULED" });
        } catch (err) {
          console.error("[integrations] scheduled sync failed", err.message);
        }
      }
    } catch (err) {
      console.error("[integrations] scheduler error", err.message);
    }
  });

  console.log("[integrations] scheduler started");
  return job;
};

export const stopIntegrationScheduler = () => {
  if (job) {
    job.stop();
    job = null;
  }
};
