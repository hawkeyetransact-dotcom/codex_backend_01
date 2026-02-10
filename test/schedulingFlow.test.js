import assert from "assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";
import { AuditSchedule } from "../src/models/auditScheduleModel.js";
import { ScheduleSlot } from "../src/models/scheduleSlotModel.js";
import { holdSlot, acceptSlot, confirmSlot } from "../src/services/scheduling/schedulingService.js";

const run = async () => {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const audit = await AuditRequestMaster.create({
    tenantOrgId: "tenant-test",
    supplier_id: new mongoose.Types.ObjectId(),
    auditor_id: new mongoose.Types.ObjectId(),
    create_by_buyer_id: new mongoose.Types.ObjectId(),
    supplier_product_id: new mongoose.Types.ObjectId(),
    complianceDate: new Date(),
    site_id: new mongoose.Types.ObjectId(),
  });

  const schedule = await AuditSchedule.create({
    tenantOrgId: "tenant-test",
    auditRequestId: audit._id,
    mode: "REMOTE",
    durationDays: 1,
    dailyStart: "09:00",
    dailyEnd: "17:00",
    auditWindowStart: new Date("2026-01-01T00:00:00Z"),
    auditWindowEnd: new Date("2026-01-05T23:59:59Z"),
  });

  const slot = await ScheduleSlot.create({
    tenantOrgId: "tenant-test",
    auditRequestId: audit._id,
    start: new Date("2026-01-02T09:00:00Z"),
    end: new Date("2026-01-02T17:00:00Z"),
    status: "candidate",
    scoreTotal: 85,
    scoreBreakdown: { auditorFit: 25, supplierFit: 25, slaFit: 20, travelFit: 15 },
  });

  const held = await holdSlot(audit._id, slot._id, audit.auditor_id, 2);
  assert.equal(held.status, "held");
  assert.ok(held.holdExpiresAt, "holdExpiresAt set");

  const accepted = await acceptSlot(audit._id, slot._id, audit.supplier_id);
  assert.equal(accepted.status, "accepted");

  const confirmed = await confirmSlot(audit._id, slot._id);
  assert.equal(confirmed.status, "confirmed");

  await AuditSchedule.updateOne(
    { auditRequestId: audit._id },
    { $set: { status: "CONFIRMED", confirmedSlotId: slot._id } }
  );

  const refreshed = await AuditSchedule.findById(schedule._id).lean();
  assert.equal(refreshed.status, "CONFIRMED");
  assert.equal(refreshed.confirmedSlotId.toString(), slot._id.toString());

  await mongoose.connection.close();
  await mongoServer.stop();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
