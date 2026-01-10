import { NotificationEvent } from "../../models/notificationEventModel.js";
import { NotificationPolicy } from "../../models/notificationPolicyModel.js";
import {
  listPolicies,
  upsertPlatformDefaultPolicy,
} from "../../services/governance/notificationPolicyService.js";
import { writeGovernanceAuditLog } from "../../services/governance/governanceAuditLogService.js";

export const listNotificationPolicies = async (req, res) => {
  const scope = req.query?.scope || "PLATFORM_DEFAULT";
  if (scope !== "PLATFORM_DEFAULT") {
    return res.status(400).json({ message: "Only PLATFORM_DEFAULT policies are supported here" });
  }
  const policies = await listPolicies({ scope: "PLATFORM_DEFAULT" });
  return res.json({ data: policies });
};

export const upsertPlatformPolicy = async (req, res) => {
  try {
    const { persona, eventKey, allowedChannels, deliveryMode, quietHours, escalation, isEnabled } = req.body || {};
    if (!persona || !eventKey) {
      return res.status(400).json({ message: "persona and eventKey are required" });
    }
    const event = await NotificationEvent.findOne({ key: eventKey }).lean();
    if (!event) {
      return res.status(404).json({ message: "Event key not found" });
    }
    const before = await NotificationPolicy.findOne({ scope: "PLATFORM_DEFAULT", persona, eventKey }).lean();
    const policy = await upsertPlatformDefaultPolicy({
      persona,
      eventKey,
      allowedChannels,
      deliveryMode,
      quietHours,
      escalation,
      isEnabled,
      createdBy: req.user?._id,
    });
    await writeGovernanceAuditLog({
      req,
      action: before ? "NOTIF_POLICY_UPDATE" : "NOTIF_POLICY_CREATE",
      targetType: "NotificationPolicy",
      targetId: policy._id.toString(),
      diff: { before, after: policy },
      tenantId: null,
    });
    return res.json({ data: policy });
  } catch (err) {
    console.error("upsertPlatformPolicy", err);
    return res.status(500).json({ message: err.message });
  }
};
