import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  createRfq,
  updateRfq,
  publishRfq,
  inviteAuditors,
  listRfqs,
  getRfq,
  postThreadMessage,
  getThreadMessages,
  submitQuote,
  reviseQuote,
  listQuotes,
  awardQuote,
} from "../controllers/rfqController.js";
import {
  createRfqValidator,
  updateRfqValidator,
  inviteAuditorsValidator,
  threadMessageValidator,
  submitQuoteValidator,
  reviseQuoteValidator,
  awardQuoteValidator,
} from "../validators/rfqValidators.js";

const router = express.Router();

router.post("/", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), validate(createRfqValidator), createRfq);
router.put("/:id", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), validate(updateRfqValidator), updateRfq);
router.post("/:id/publish", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), publishRfq);
router.post("/:id/invite", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), validate(inviteAuditorsValidator), inviteAuditors);
router.get("/", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin", "auditor"), listRfqs);
router.get("/:id", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin", "auditor"), getRfq);

router.get("/:id/thread", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin", "auditor"), getThreadMessages);
router.post("/:id/thread/message", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin", "auditor"), validate(threadMessageValidator), postThreadMessage);
router.post("/:id/quotes", authenticate, permit("auditor"), validate(submitQuoteValidator), submitQuote);
router.put("/:id/quotes/:quoteId", authenticate, permit("auditor"), validate(reviseQuoteValidator), reviseQuote);
router.get("/:id/quotes", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin", "auditor"), listQuotes);
router.post("/:id/award", authenticate, permit("buyer", "tenant_admin", "admin", "superadmin"), validate(awardQuoteValidator), awardQuote);

export default router;
