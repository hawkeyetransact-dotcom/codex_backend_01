import Tenant from "../models/tenantModel.js";
import { Subscription } from "../models/subscriptionModel.js";
import { ApprovalRequest } from "../models/approvalRequestModel.js";
import { AdminAuditLog } from "../models/adminAuditLogModel.js";
import { User } from "../models/userModel.js";
import { AccessGrant } from "../models/accessGrantModel.js";

const logAdmin = async ({ req, action, entityType, entityId, tenant_id }) => {
  try {
    await AdminAuditLog.create({
      tenant_id: tenant_id || null,
      actorUserId: req.user?._id,
      adminScope: req.adminScope,
      action,
      entityType,
      entityId,
      details: JSON.stringify(req.body || {}),
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
};

export const createTenant = async (req, res) => {
  try {
    const tenant = await Tenant.create(req.body);
    await logAdmin({ req, action: "createTenant", entityType: "Tenant", entityId: tenant._id, tenant_id: tenant._id });
    return res.json({ data: tenant });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

export const listTenants = async (_req, res) => {
  const tenants = await Tenant.find().lean();
  return res.json({ data: tenants });
};

export const getTenant = async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) return res.status(404).json({ message: "Not found" });
  return res.json({ data: tenant });
};

export const updateTenant = async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!tenant) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "updateTenant", entityType: "Tenant", entityId: tenant._id, tenant_id: tenant._id });
  return res.json({ data: tenant });
};

export const suspendTenant = async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, { status: "SUSPENDED" }, { new: true });
  if (!tenant) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "suspendTenant", entityType: "Tenant", entityId: tenant._id, tenant_id: tenant._id });
  return res.json({ data: tenant });
};

export const assignOwners = async (req, res) => {
  const { ownerUserIds = [] } = req.body || {};
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, { ownerUserIds }, { new: true });
  if (!tenant) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "assignOwners", entityType: "Tenant", entityId: tenant._id, tenant_id: tenant._id });
  return res.json({ data: tenant });
};

export const setSubscription = async (req, res) => {
  const { plan, status, seats, entitlements } = req.body || {};
  const subscription = await Subscription.findOneAndUpdate(
    { tenant_id: req.params.id },
    { plan, status, seats, entitlements },
    { upsert: true, new: true }
  );
  await logAdmin({ req, action: "setSubscription", entityType: "Subscription", entityId: subscription._id, tenant_id: req.params.id });
  return res.json({ data: subscription });
};

export const listApprovals = async (_req, res) => {
  const items = await ApprovalRequest.find().sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ data: items });
};

export const approveRequest = async (req, res) => {
  const appr = await ApprovalRequest.findByIdAndUpdate(req.params.id, { status: "APPROVED", decisionNote: req.body?.note }, { new: true });
  if (!appr) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "approveRequest", entityType: "ApprovalRequest", entityId: appr._id, tenant_id: appr.tenant_id });
  return res.json({ data: appr });
};

export const rejectRequest = async (req, res) => {
  const appr = await ApprovalRequest.findByIdAndUpdate(req.params.id, { status: "REJECTED", decisionNote: req.body?.note }, { new: true });
  if (!appr) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "rejectRequest", entityType: "ApprovalRequest", entityId: appr._id, tenant_id: appr.tenant_id });
  return res.json({ data: appr });
};

export const globalUserSearch = async (req, res) => {
  const { q } = req.query;
  const filter = q ? { email: new RegExp(q, "i") } : {};
  const users = await User.find(filter).limit(50).lean();
  return res.json({ data: users });
};

export const disableUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { status: "DISABLED" }, { new: true });
  if (!user) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "disableUser", entityType: "User", entityId: user._id, tenant_id: user.tenant_id });
  return res.json({ data: user });
};

export const auditLogs = async (req, res) => {
  const { tenantId } = req.query;
  const filter = tenantId ? { tenant_id: tenantId } : {};
  const logs = await AdminAuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({ data: logs });
};
