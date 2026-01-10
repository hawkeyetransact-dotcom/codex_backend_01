export const isPolicyActive = (policy, now = new Date()) => {
  if (!policy?.startAt || !policy?.endAt) return false;
  const start = new Date(policy.startAt);
  const end = new Date(policy.endAt);
  return now >= start && now <= end;
};

export const resolvePolicyStatus = (policy, now = new Date()) => {
  if (!policy?.startAt || !policy?.endAt) return "SCHEDULED";
  if (isPolicyActive(policy, now)) return "ACTIVE";
  return now > new Date(policy.endAt) ? "EXPIRED" : "SCHEDULED";
};

export const recipientMatchesUser = (recipient, user) => {
  if (!recipient || !user) return false;
  const value = String(recipient.value || "");
  switch (recipient.type) {
    case "userId":
      return String(user._id) === value;
    case "email":
      return String(user.email || "").toLowerCase() === value.toLowerCase();
    case "role":
      return String(user.role || "") === value;
    case "tenant":
      return String(user.tenant_id || user.tenantId || "") === value;
    default:
      return false;
  }
};

export const policyAllowsUser = (policy, user) => {
  const recipients = Array.isArray(policy?.recipients) ? policy.recipients : [];
  return recipients.some((recipient) => recipientMatchesUser(recipient, user));
};

export const canAccessPolicy = (policy, user, now = new Date()) => {
  if (!policy) return false;
  if (!isPolicyActive(policy, now)) return false;
  return policyAllowsUser(policy, user);
};
