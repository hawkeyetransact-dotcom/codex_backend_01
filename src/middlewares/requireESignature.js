/**
 * E-signature enforcement middleware.
 *
 * Wraps a closure / approval / publish endpoint with a 21 CFR Part 11
 * §11.50 signature gate. The route handler must receive a body that
 * carries either:
 *   { signatureMeaning, signaturePassword }   — sign inline (PASSWORD method)
 *     OR
 *   { electronicSignatureId }                 — pre-signed via /api/electronic-signatures/sign
 *
 * If neither is present:
 *   - When ENFORCE_ESIG=hard      → 400 Bad Request
 *   - When ENFORCE_ESIG=soft (default) → log a warning + let the request through.
 *     This keeps backwards compatibility for tenants that haven't yet
 *     adopted e-sig while still letting QA leadership flip the flag.
 *
 * Wire on a route:
 *   router.post('/api/deviations/:id/close',
 *     authenticate, requireTenantActive, permit(...EDITOR_ROLES),
 *     requireESignature({ recordType: 'deviation', meaning: 'CLOSURE' }),
 *     closeDeviation);
 *
 * The handler can read req.electronicSignature (the persisted row) to
 * link it from the closure record (e.g. closureSignatureId field).
 */
import mongoose from "mongoose";
import crypto from "crypto";

async function getModel(name) { try { return mongoose.model(name); } catch { return null; } }

export function requireESignature({ recordType, meaning = "APPROVED", method = "PASSWORD" } = {}) {
  return async (req, res, next) => {
    const mode = String(process.env.ENFORCE_ESIG || "soft").toLowerCase();
    const body = req.body || {};

    // Path A — pre-signed reference
    if (body.electronicSignatureId) {
      const Sig = await getModel("electronic-signatures") || await getModel("ElectronicSignature");
      if (Sig) {
        const sig = await Sig.findOne({ _id: body.electronicSignatureId, tenantId: req.user?.tenant_id }).lean();
        if (!sig) {
          return res.status(400).json({ error: "Referenced electronic signature not found in this tenant" });
        }
        req.electronicSignature = sig;
        return next();
      }
    }

    // Path B — inline sign with password
    if (body.signaturePassword) {
      // Lazy verify against the user's hashed password.
      try {
        const User = await getModel("users");
        const user = User ? await User.findById(req.user._id).select("password").lean() : null;
        if (!user) return res.status(401).json({ error: "Cannot verify e-signature — user not found" });
        const bcrypt = await import("bcryptjs");
        const ok = await bcrypt.compare(body.signaturePassword, user.password);
        if (!ok) return res.status(401).json({ error: "E-signature password does not match" });

        const Sig = await getModel("electronic-signatures") || await getModel("ElectronicSignature");
        if (Sig) {
          const recordId = req.params?.id || req.params?.capaId || null;
          const contentHash = crypto.createHash("sha256")
            .update(`${recordType}:${recordId}:${meaning}:${req.user._id}:${Date.now()}`)
            .digest("hex");
          const sig = await Sig.create({
            tenantId: req.user.tenant_id,
            recordType,
            recordId,
            signerUserId: req.user._id,
            signatureMeaning: body.signatureMeaning || meaning,
            authMethod: method,
            contentHash,
            signerIp: req.ip,
            signerUserAgent: req.headers["user-agent"],
            signedAt: new Date(),
          });
          req.electronicSignature = sig;
        }
        return next();
      } catch (err) {
        return res.status(500).json({ error: `E-signature error: ${err.message}` });
      }
    }

    // Path C — neither — apply enforcement mode
    if (mode === "hard") {
      return res.status(400).json({
        error: "Electronic signature required (21 CFR Part 11 §11.50)",
        hint: "POST body must include either electronicSignatureId or signaturePassword",
        recordType, meaning,
      });
    }
    // soft mode — log + continue
    console.warn(`[esig:soft] ${recordType} ${meaning} closed without e-signature by user ${req.user?._id} on tenant ${req.user?.tenant_id}`);
    next();
  };
}
