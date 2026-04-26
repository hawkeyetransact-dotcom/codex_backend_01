/**
 * OVERDUE scanner — scans every module that has dueDate + status fields
 * and flips records to OVERDUE when their dueDate has passed and they are
 * not in a terminal state. Writes per-flip rows to notificationOutbox so
 * the notification policy can fan out emails / Slack / push.
 *
 * Single function entrypoint runs across:
 *   - training-records          (status NOT IN [COMPLETED, WAIVED, FAILED])
 *   - management-reviews.actionItems  (status NOT IN [COMPLETED, CANCELLED])
 *   - capa-v2-action-items      (status NOT IN [COMPLETED, CANCELLED])
 *   - equipment                 (calibrationStatus → OVERDUE if nextCalibrationDue < today)
 */
import mongoose from "mongoose";

async function getModel(name) {
  try { return mongoose.model(name); } catch { return null; }
}

async function notify({ tenantId, recordType, recordId, summary }) {
  try {
    const Outbox = await getModel("notification-outbox") || await getModel("notificationOutbox");
    if (!Outbox) return false;
    await Outbox.create({
      tenantId,
      eventType: "RECORD_OVERDUE",
      severity: "WARNING",
      payload: { recordType, recordId, summary },
      status: "PENDING",
      createdAt: new Date(),
    });
    return true;
  } catch { return false; }
}

export async function scanOverdue({ tenantId } = {}) {
  const now = new Date();
  const summary = { tenantsScanned: 0, training: 0, mrmActions: 0, capaActions: 0, equipment: 0, notifications: 0 };
  const filter = tenantId ? { tenantId } : {};

  // ─── 1. Training records ──────────────────────────────────────────
  const Training = await getModel("training-records");
  if (Training) {
    const docs = await Training.find({
      ...filter,
      dueDate: { $lt: now },
      status: { $nin: ["COMPLETED", "WAIVED", "FAILED", "OVERDUE"] },
    }).select("_id tenantId trainingCode trainingTitle traineeId dueDate status").lean();

    for (const d of docs) {
      await Training.updateOne({ _id: d._id }, { $set: { status: "OVERDUE" } });
      const ok = await notify({
        tenantId: d.tenantId,
        recordType: "training-record",
        recordId: d._id,
        summary: `Training overdue: ${d.trainingCode} · ${d.trainingTitle} · trainee ${d.traineeId}`,
      });
      if (ok) summary.notifications++;
      summary.training++;
    }
  }

  // ─── 2. Management Review action items (subdocument) ──────────────
  const MRM = await getModel("management-reviews");
  if (MRM) {
    const reviews = await MRM.find({ ...filter, "actionItems.dueDate": { $lt: now } }).lean();
    for (const r of reviews) {
      let updated = false;
      const updatedItems = (r.actionItems || []).map((item) => {
        if (item.dueDate && new Date(item.dueDate) < now &&
            !["COMPLETED", "CANCELLED", "OVERDUE"].includes(item.status)) {
          updated = true;
          summary.mrmActions++;
          notify({
            tenantId: r.tenantId,
            recordType: "mrm-action-item",
            recordId: item._id,
            summary: `MRM action overdue: ${item.description} · MRM ${r.reviewNumber}`,
          }).then((ok) => { if (ok) summary.notifications++; });
          return { ...item, status: "OVERDUE" };
        }
        return item;
      });
      if (updated) await MRM.updateOne({ _id: r._id }, { $set: { actionItems: updatedItems } });
    }
  }

  // ─── 3. CAPA-v2 action items ──────────────────────────────────────
  const CapaActionItem = await getModel("capa-v2-action-items");
  if (CapaActionItem) {
    const docs = await CapaActionItem.find({
      ...filter,
      dueDate: { $lt: now },
      status: { $nin: ["COMPLETED", "CANCELLED"] },
    }).select("_id tenantId capaId description").lean();

    for (const d of docs) {
      await CapaActionItem.updateOne({ _id: d._id }, { $set: { status: "BLOCKED", blockedReason: "OVERDUE" } });
      const ok = await notify({
        tenantId: d.tenantId,
        recordType: "capa-v2-action-item",
        recordId: d._id,
        summary: `CAPA action overdue: ${d.description}`,
      });
      if (ok) summary.notifications++;
      summary.capaActions++;
    }
  }

  // ─── 4. Equipment calibration ─────────────────────────────────────
  const Equipment = await getModel("equipment-master") || await getModel("Equipment");
  if (Equipment) {
    const docs = await Equipment.find({
      ...filter,
      requiresCalibration: true,
      nextCalibrationDue: { $lt: now },
      calibrationStatus: { $ne: "OVERDUE" },
      status: { $ne: "RETIRED" },
    }).select("_id tenantId equipmentNumber name nextCalibrationDue").lean();

    for (const d of docs) {
      await Equipment.updateOne({ _id: d._id }, { $set: { calibrationStatus: "OVERDUE" } });
      const ok = await notify({
        tenantId: d.tenantId,
        recordType: "equipment",
        recordId: d._id,
        summary: `Equipment calibration overdue: ${d.equipmentNumber} · ${d.name}`,
      });
      if (ok) summary.notifications++;
      summary.equipment++;
    }
  }

  return { ok: true, scannedAt: now, ...summary };
}
