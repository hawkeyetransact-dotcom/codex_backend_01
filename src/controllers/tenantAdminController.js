import Tenant from "../models/tenantModel.js";
import { User } from "../models/userModel.js";
import { ApprovalRequest } from "../models/approvalRequestModel.js";
import { AdminAuditLog } from "../models/adminAuditLogModel.js";

const logAdmin = async ({ req, action, entityType, entityId }) => {
  try {
    await AdminAuditLog.create({
      tenant_id: req.tenantId,
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

export const getCompany = async (req, res) => {
  const tenant = await Tenant.findById(req.tenantId).lean();
  if (!tenant) return res.status(404).json({ message: "Not found" });
  return res.json({ data: tenant });
};

export const updateCompany = async (req, res) => {
  const tenant = await Tenant.findByIdAndUpdate(req.tenantId, req.body, { new: true });
  if (!tenant) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "updateCompany", entityType: "Tenant", entityId: tenant._id });
  return res.json({ data: tenant });
};

export const listUsers = async (req, res) => {
  const users = await User.find({ tenant_id: req.tenantId }).lean();
  return res.json({ data: users });
};

// Aliases for adminRoutes
export const listTenantUsers = listUsers;

export const inviteUser = async (req, res) => {
  const { email, role } = req.body || {};
  const user = await User.create({ email, role, tenant_id: req.tenantId, adminScope: "NONE" });
  await logAdmin({ req, action: "inviteUser", entityType: "User", entityId: user._id });
  return res.json({ data: user });
};

export const updateTenantUser = async (req, res) => {
  const { role, status, adminScope } = req.body || {};
  const updates = {};
  if (role) updates.role = role;
  if (status) updates.status = status;
  if (adminScope) updates.adminScope = adminScope;
  const user = await User.findOneAndUpdate({ _id: req.params.userId, tenant_id: req.tenantId }, updates, { new: true });
  if (!user) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "updateUser", entityType: "User", entityId: user._id });
  return res.json({ data: user });
};

export const disableUserTenant = async (req, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.id, tenant_id: req.tenantId }, { status: "DISABLED" }, { new: true });
  if (!user) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "disableUser", entityType: "User", entityId: user._id });
  return res.json({ data: user });
};

export const disableUser = async (req, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.userId, tenant_id: req.tenantId }, { status: "DISABLED" }, { new: true });
  if (!user) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "disableUser", entityType: "User", entityId: user._id });
  return res.json({ data: user });
};

export const enableUser = async (req, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.userId, tenant_id: req.tenantId }, { status: "ACTIVE" }, { new: true });
  if (!user) return res.status(404).json({ message: "Not found" });
  await logAdmin({ req, action: "enableUser", entityType: "User", entityId: user._id });
  return res.json({ data: user });
};

export const createApproval = async (req, res) => {
  const body = req.body || {};
  const appr = await ApprovalRequest.create({ ...body, tenant_id: req.tenantId, requesterUserId: req.user._id });
  await logAdmin({ req, action: "createApproval", entityType: "ApprovalRequest", entityId: appr._id });
  return res.json({ data: appr });
};

export const listApprovalTenant = async (_req, res) => {
  const items = await ApprovalRequest.find({ tenant_id: res.req?.tenantId || res.req?.tenant_id || res.req?.tenantId }).lean(); // fallback
  return res.json({ data: items });
};

export const tenantAuditLogs = async (req, res) => {
  const logs = await AdminAuditLog.find({ tenant_id: req.tenantId }).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({ data: logs });
};

export const listTenantAuditLogs = tenantAuditLogs;
