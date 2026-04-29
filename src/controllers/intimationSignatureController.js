/**
 * intimationSignatureController.js
 *
 * G1: Supplier signs the intimation letter (Step S05). 21 CFR Part 11
 * compliant — captures signer identity, meaning, time, IP/UA, and links
 * the signature row to the AuditArtifact data so re-signing is detectable.
 */
import { AuditArtifact } from "../models/auditArtifactModel.js";
import { AuditRequestMaster } from "../models/auditRequestsMasterModel.js";
import { ElectronicSignature } from "../models/electronicSignatureModel.js";
import { notifyUsers } from "../services/governance/notifySupplier.js";

/**
 * POST /api/audits/:auditId/intimation/sign
 * Body: { meaning?: 'AUTHORED'|'REVIEWED'|'APPROVED'|'WITNESSED'|'VERIFIED'  (default APPROVED),
 *         comments?: string, signerFullName?: string }
 *
 * Permission: supplier or supplierUser only — they're the signing party.
 */
export const signIntimationLetter = async (req, res) => {
  try {
    const { auditId } = req.params;
    const { meaning = "APPROVED", comments, signerFullName } = req.body || {};

    const audit = await AuditRequestMaster.findById(auditId).lean();
    if (!audit) return res.status(404).json({ error: "Audit not found" });

    // Only the assigned supplier (or one of their users) may sign.
    const supplierId = String(audit.supplier_id || "");
    const meId = String(req.user._id || "");
    const meInvitedBy = String(req.user.invitedBy || "");
    if (supplierId !== meId && supplierId !== meInvitedBy) {
      return res.status(403).json({ error: "Only the assigned supplier may sign the intimation letter" });
    }

    const artifact = await AuditArtifact.findOne({
      auditId,
      artifactType: "INTIMATION_LETTER",
    });
    if (!artifact) {
      return res.status(404).json({ error: "Intimation letter not found for this audit" });
    }

    // Reject re-signing for the same person — supplier needs only one signature.
    const existing = await ElectronicSignature.findOne({
      recordType: "INTIMATION_LETTER",
      recordId: artifact._id,
      signerId: req.user._id,
    });
    if (existing) {
      return res.status(409).json({ error: "Intimation letter already signed by this user", signatureId: existing._id });
    }

    const sig = await ElectronicSignature.create({
      recordType: "INTIMATION_LETTER",
      recordId: artifact._id,
      recordVersion: 1,
      signerId: req.user._id,
      signerEmail: req.user.email,
      signerFullName: signerFullName || `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
      signerRole: req.user.role,
      signatureMeaning: meaning,
      authMethod: "PASSWORD",
      reasonForChange: comments || null,
      tenantOrgId: audit.tenantOrgId || req.tenantId || null,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Stamp the artifact + audit so downstream gates know the supplier acknowledged.
    artifact.data = {
      ...(artifact.data && typeof artifact.data === "object" ? artifact.data : {}),
      supplierSignedAt: new Date(),
      supplierSignedBy: req.user._id,
      supplierSignatureId: sig._id,
      finalized: true,
    };
    artifact.markModified("data");
    artifact.updatedBy = req.user._id;
    await artifact.save();

    // Update audit with the new acknowledgement field already used elsewhere.
    await AuditRequestMaster.findByIdAndUpdate(auditId, {
      $set: {
        supplierIntimationAcceptedAt: new Date(),
        trackStatus: "Intimation acknowledged",
        nextAuditOn: "buyer",
      },
    });

    // Notify the buyer + auditor that the intimation has been signed.
    const recipients = [audit.create_by_buyer_id, audit.auditor_id].filter(Boolean);
    if (recipients.length) {
      notifyUsers({
        tenantId: audit.tenantOrgId,
        userIds: recipients,
        eventKey: "INTIMATION_LETTER_SIGNED",
        actionUrl: `/audits/${auditId}/progress?focus=intimation`,
        payload: { auditId, artifactId: artifact._id, signatureId: sig._id, meaning },
      }).catch((e) => console.error("notifyUsers(INTIMATION_LETTER_SIGNED) failed:", e?.message));
    }

    return res.status(201).json({ data: sig, artifact });
  } catch (err) {
    console.error("signIntimationLetter error:", err);
    return res.status(500).json({ error: err.message || "Failed to sign intimation letter" });
  }
};
