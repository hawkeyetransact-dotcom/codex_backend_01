import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/userModel.js";
import { AuditorProfile } from "../src/models/auditorProfileModel.js";
import { AuditorAffiliation } from "../src/models/auditorAffiliationModel.js";
import { AuditRequestMaster } from "../src/models/auditRequestsMasterModel.js";

const run = async () => {
  await connectDatabase();
  const auditors = await User.find({ role: "auditor" }).lean();
  console.log(`Found ${auditors.length} auditor users`);
  for (const auditor of auditors) {
    let profile = await AuditorProfile.findOne({ user_id: auditor._id });
    if (!profile) {
      profile = await AuditorProfile.create({
        user_id: auditor._id,
        tenant_id: auditor.tenant_id || null,
        title: "Auditor",
        firstName: auditor.email?.split("@")[0] || "Auditor",
        lastName: "N/A",
        countryCode: "+1",
        phone: 0,
        companyName: "Unknown",
        addressline1: "Not provided",
        addressline2: "",
        addressline3: "",
        country: "Unknown",
        state: "",
        city: "",
        zipcode: "00000",
      });
      console.log(`Created AuditorProfile for ${auditor.email}`);
    }
    // Create internal affiliation if tenant exists
    if (auditor.tenant_id) {
      await AuditorAffiliation.findOneAndUpdate(
        { auditorProfileId: profile._id, orgTenantId: auditor.tenant_id },
        { affiliationType: "INTERNAL", status: "ACTIVE" },
        { upsert: true }
      );
    }
    // Backfill assignedAuditors
    const audits = await AuditRequestMaster.find({ auditor_id: auditor._id });
    for (const audit of audits) {
      const hasAssigned =
        Array.isArray(audit.assignedAuditors) &&
        audit.assignedAuditors.some((a) => String(a.auditorProfileId || "") === String(profile._id));
      if (!hasAssigned) {
        audit.assignedAuditors = [
          {
            auditorProfileId: profile._id,
            role: "LEAD",
            permissions: [],
            assignedAt: new Date(),
            assignedBy: audit.create_by_buyer_id || null,
          },
        ];
        await audit.save();
        console.log(`Backfilled assignedAuditors for audit ${audit._id}`);
      }
    }
  }
  await mongoose.connection.close();
  console.log("Backfill complete");
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
