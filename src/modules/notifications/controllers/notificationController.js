import mongoose from "mongoose";
import Notification from "../models/notificationModel.js";
import NotificationFolder from "../models/notificationFolderModel.js";
import NotificationLabel from "../models/notificationLabelModel.js";

const SYSTEM_FOLDERS = [
  { systemKey: "INBOX", name: "Inbox", color: "#2563eb", sortOrder: 0 },
  { systemKey: "ARCHIVED", name: "Archived", color: "#64748b", sortOrder: 1 },
];

const RESERVED_FOLDER_KEYS = new Set(["INBOX", "ARCHIVED"]);

const toBool = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
};

const toObjectId = (value) => {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return null;
};

const normalizeHexColor = (value, fallback) => {
  const str = String(value || "").trim();
  if (!str) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(str) ? str : fallback;
};

const parseLabelIds = (value) => {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .map((id) => toObjectId(id))
    .filter(Boolean);
};

const baseFilter = (req) => ({
  tenantId: req.tenantId,
  recipientUserId: req.user._id,
  isDeleted: false,
});

const ensureSystemFolders = async (tenantId, userId) => {
  for (const folder of SYSTEM_FOLDERS) {
    await NotificationFolder.findOneAndUpdate(
      {
        tenantId,
        userId,
        systemKey: folder.systemKey,
        isDeleted: false,
      },
      {
        $setOnInsert: {
          tenantId,
          userId,
          name: folder.name,
          color: folder.color,
          sortOrder: folder.sortOrder,
          isSystem: true,
          systemKey: folder.systemKey,
          isDeleted: false,
        },
      },
      { upsert: true, new: true }
    );
  }

  return NotificationFolder.find({ tenantId, userId, isDeleted: false }).sort({ sortOrder: 1, name: 1 }).lean();
};

const getOwnedFolder = async (tenantId, userId, folderId) => {
  const oid = toObjectId(folderId);
  if (!oid) return null;
  return NotificationFolder.findOne({
    _id: oid,
    tenantId,
    userId,
    isDeleted: false,
  });
};

const validateOwnedLabels = async (tenantId, userId, labelIds) => {
  if (!labelIds.length) return [];
  const labels = await NotificationLabel.find({
    _id: { $in: labelIds },
    tenantId,
    userId,
    isDeleted: false,
  }).select("_id");
  const owned = labels.map((label) => label._id.toString());
  const requested = labelIds.map((id) => id.toString());
  if (owned.length !== requested.length) {
    return null;
  }
  return requested;
};

const buildFilter = (req) => {
  const { unreadOnly, severity, type, entityType, from, to, archived, folder, folderId, includeArchived, labelIds } = req.query;
  const filter = baseFilter(req);

  if (toBool(unreadOnly, false)) filter.isRead = false;
  if (severity) filter.severity = severity;
  if (type) filter.type = type;
  if (entityType) filter.entityType = entityType;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const normalizedFolder = String(folder || folderId || "").trim();
  const includeArchivedItems = toBool(includeArchived, false);
  const archivedOnly = toBool(archived, false);

  if (normalizedFolder) {
    if (normalizedFolder.toUpperCase() === "INBOX") {
      filter.archivedAt = null;
      filter.folderId = null;
    } else if (normalizedFolder.toUpperCase() === "ARCHIVED") {
      filter.archivedAt = { $ne: null };
    } else {
      const folderObjectId = toObjectId(normalizedFolder);
      if (folderObjectId) {
        filter.archivedAt = null;
        filter.folderId = folderObjectId;
      }
    }
  } else if (archivedOnly) {
    filter.archivedAt = { $ne: null };
  } else if (!includeArchivedItems) {
    filter.archivedAt = null;
  }

  const parsedLabels = parseLabelIds(labelIds);
  if (parsedLabels.length) {
    filter.labelIds = { $all: parsedLabels };
  }

  return filter;
};

const serializeCollections = async (req) => {
  const [folders, labels] = await Promise.all([
    ensureSystemFolders(req.tenantId, req.user._id),
    NotificationLabel.find({ tenantId: req.tenantId, userId: req.user._id, isDeleted: false })
      .sort({ name: 1 })
      .lean(),
  ]);
  return { folders, labels };
};

export const listNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, sort = "-createdAt", includeCollections } = req.query;
    const filter = buildFilter(req);
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total, collections] = await Promise.all([
      Notification.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(filter),
      toBool(includeCollections, false) ? serializeCollections(req) : Promise.resolve(null),
    ]);

    const payload = {
      success: true,
      data: items,
      meta: { total, page: pageNum, limit: limitNum },
    };
    if (collections) {
      payload.collections = collections;
    }
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to list notifications" });
  }
};

export const unreadCount = async (req, res) => {
  try {
    const filter = {
      ...baseFilter(req),
      isRead: false,
    };
    const count = await Notification.countDocuments(filter);
    return res.json({ success: true, data: { count } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch unread count" });
  }
};

export const markRead = async (req, res) => {
  try {
    const notif = await Notification.findOne({
      _id: req.params.id,
      ...baseFilter(req),
    });
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });
    notif.isRead = true;
    notif.readAt = new Date();
    await notif.save();
    return res.json({ success: true, data: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to mark read" });
  }
};

export const markUnread = async (req, res) => {
  try {
    const notif = await Notification.findOne({
      _id: req.params.id,
      ...baseFilter(req),
    });
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });
    notif.isRead = false;
    notif.readAt = null;
    await notif.save();
    return res.json({ success: true, data: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to mark unread" });
  }
};

export const markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        ...baseFilter(req),
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      }
    );
    return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to mark all read" });
  }
};

export const snoozeNotification = async (req, res) => {
  try {
    const { snoozedUntil } = req.body || {};
    if (!snoozedUntil) return res.status(400).json({ success: false, message: "snoozedUntil required" });
    const notif = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        ...baseFilter(req),
      },
      {
        $set: { snoozedUntil: new Date(snoozedUntil) },
      },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to snooze notification" });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const notif = await Notification.findOne({
      _id: req.params.id,
      ...baseFilter(req),
    });
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });
    notif.isDeleted = true;
    await notif.save();
    return res.json({ success: true, data: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete notification" });
  }
};

export const archiveNotification = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        ...baseFilter(req),
      },
      {
        $set: {
          archivedAt: new Date(),
          folderId: null,
        },
      },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to archive notification" });
  }
};

export const unarchiveNotification = async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        ...baseFilter(req),
      },
      {
        $set: {
          archivedAt: null,
          folderId: null,
        },
      },
      { new: true }
    );
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to unarchive notification" });
  }
};

export const moveNotification = async (req, res) => {
  try {
    const { folderId } = req.body || {};

    if (folderId === null || folderId === undefined || folderId === "") {
      const updated = await Notification.findOneAndUpdate(
        { _id: req.params.id, ...baseFilter(req) },
        { $set: { folderId: null, archivedAt: null } },
        { new: true }
      );
      if (!updated) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, data: updated });
    }

    const folder = await getOwnedFolder(req.tenantId, req.user._id, folderId);
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    if (folder.systemKey === "ARCHIVED") {
      const updated = await Notification.findOneAndUpdate(
        { _id: req.params.id, ...baseFilter(req) },
        { $set: { archivedAt: new Date(), folderId: null } },
        { new: true }
      );
      if (!updated) return res.status(404).json({ success: false, message: "Not found" });
      return res.json({ success: true, data: updated });
    }

    const updated = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...baseFilter(req) },
      {
        $set: {
          folderId: folder._id,
          archivedAt: null,
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Not found" });
    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to move notification" });
  }
};

export const setNotificationLabels = async (req, res) => {
  try {
    const { labelIds, mode = "replace" } = req.body || {};
    const parsedLabelIds = parseLabelIds(labelIds);
    const validLabelIds = await validateOwnedLabels(req.tenantId, req.user._id, parsedLabelIds);
    if (validLabelIds === null) {
      return res.status(400).json({ success: false, message: "One or more labels do not belong to this user" });
    }

    const notif = await Notification.findOne({ _id: req.params.id, ...baseFilter(req) });
    if (!notif) return res.status(404).json({ success: false, message: "Not found" });

    const current = new Set((notif.labelIds || []).map((id) => String(id)));
    if (mode === "add") {
      validLabelIds.forEach((id) => current.add(id));
      notif.labelIds = Array.from(current);
    } else if (mode === "remove") {
      validLabelIds.forEach((id) => current.delete(id));
      notif.labelIds = Array.from(current);
    } else {
      notif.labelIds = validLabelIds;
    }

    await notif.save();
    return res.json({ success: true, data: notif });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to update labels" });
  }
};

export const bulkUpdateNotifications = async (req, res) => {
  try {
    const { action, ids = [], folderId, labelIds = [] } = req.body || {};
    const validIds = (Array.isArray(ids) ? ids : [])
      .map((id) => toObjectId(id))
      .filter(Boolean);

    if (!action) return res.status(400).json({ success: false, message: "action is required" });
    if (!validIds.length) return res.status(400).json({ success: false, message: "ids are required" });

    const filter = {
      ...baseFilter(req),
      _id: { $in: validIds },
    };

    if (action === "markRead") {
      const result = await Notification.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    if (action === "markUnread") {
      const result = await Notification.updateMany(filter, { $set: { isRead: false, readAt: null } });
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    if (action === "delete") {
      const result = await Notification.updateMany(filter, { $set: { isDeleted: true } });
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    if (action === "archive") {
      const result = await Notification.updateMany(filter, { $set: { archivedAt: new Date(), folderId: null } });
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    if (action === "unarchive") {
      const result = await Notification.updateMany(filter, { $set: { archivedAt: null, folderId: null } });
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    if (action === "move") {
      if (folderId === null || folderId === undefined || folderId === "") {
        const result = await Notification.updateMany(filter, { $set: { folderId: null, archivedAt: null } });
        return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
      }
      const folder = await getOwnedFolder(req.tenantId, req.user._id, folderId);
      if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });
      const update = folder.systemKey === "ARCHIVED"
        ? { $set: { archivedAt: new Date(), folderId: null } }
        : { $set: { folderId: folder._id, archivedAt: null } };
      const result = await Notification.updateMany(filter, update);
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    if (["labels:add", "labels:remove", "labels:replace"].includes(action)) {
      const parsedLabelIds = parseLabelIds(labelIds);
      const validLabelIds = await validateOwnedLabels(req.tenantId, req.user._id, parsedLabelIds);
      if (validLabelIds === null) {
        return res.status(400).json({ success: false, message: "One or more labels do not belong to this user" });
      }

      if (action === "labels:add") {
        const result = await Notification.updateMany(filter, { $addToSet: { labelIds: { $each: validLabelIds } } });
        return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
      }
      if (action === "labels:remove") {
        const result = await Notification.updateMany(filter, { $pull: { labelIds: { $in: validLabelIds } } });
        return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
      }
      const result = await Notification.updateMany(filter, { $set: { labelIds: validLabelIds } });
      return res.json({ success: true, data: { modified: result.modifiedCount || 0 } });
    }

    return res.status(400).json({ success: false, message: "Unsupported action" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Bulk update failed" });
  }
};

export const listFolders = async (req, res) => {
  try {
    const folders = await ensureSystemFolders(req.tenantId, req.user._id);
    return res.json({ success: true, data: folders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to list folders" });
  }
};

export const createFolder = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Folder name is required" });
    if (RESERVED_FOLDER_KEYS.has(name.toUpperCase())) {
      return res.status(400).json({ success: false, message: "Folder name is reserved" });
    }

    const folder = await NotificationFolder.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      name,
      color: normalizeHexColor(req.body?.color, "#64748b"),
      sortOrder: Number(req.body?.sortOrder) || 100,
      isSystem: false,
      systemKey: null,
    });

    return res.status(201).json({ success: true, data: folder });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Folder name already exists" });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to create folder" });
  }
};

export const updateFolder = async (req, res) => {
  try {
    const folder = await NotificationFolder.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      userId: req.user._id,
      isDeleted: false,
    });
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });
    if (folder.isSystem) {
      return res.status(400).json({ success: false, message: "System folders cannot be edited" });
    }

    const name = String(req.body?.name || "").trim();
    if (name) folder.name = name;
    if (req.body?.color !== undefined) folder.color = normalizeHexColor(req.body?.color, folder.color || "#64748b");
    if (req.body?.sortOrder !== undefined) folder.sortOrder = Number(req.body.sortOrder) || folder.sortOrder;

    await folder.save();
    return res.json({ success: true, data: folder });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Folder name already exists" });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to update folder" });
  }
};

export const deleteFolder = async (req, res) => {
  try {
    const folder = await NotificationFolder.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      userId: req.user._id,
      isDeleted: false,
    });
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });
    if (folder.isSystem) {
      return res.status(400).json({ success: false, message: "System folders cannot be deleted" });
    }

    folder.isDeleted = true;
    await folder.save();

    await Notification.updateMany(
      {
        ...baseFilter(req),
        folderId: folder._id,
      },
      { $set: { folderId: null } }
    );

    return res.json({ success: true, data: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete folder" });
  }
};

export const listLabels = async (req, res) => {
  try {
    const labels = await NotificationLabel.find({
      tenantId: req.tenantId,
      userId: req.user._id,
      isDeleted: false,
    })
      .sort({ name: 1 })
      .lean();
    return res.json({ success: true, data: labels });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to list labels" });
  }
};

export const createLabel = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Label name is required" });

    const label = await NotificationLabel.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      name,
      color: normalizeHexColor(req.body?.color, "#0ea5e9"),
    });

    return res.status(201).json({ success: true, data: label });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Label name already exists" });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to create label" });
  }
};

export const updateLabel = async (req, res) => {
  try {
    const label = await NotificationLabel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      userId: req.user._id,
      isDeleted: false,
    });
    if (!label) return res.status(404).json({ success: false, message: "Label not found" });

    const name = String(req.body?.name || "").trim();
    if (name) label.name = name;
    if (req.body?.color !== undefined) label.color = normalizeHexColor(req.body?.color, label.color || "#0ea5e9");
    await label.save();

    return res.json({ success: true, data: label });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Label name already exists" });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to update label" });
  }
};

export const deleteLabel = async (req, res) => {
  try {
    const label = await NotificationLabel.findOne({
      _id: req.params.id,
      tenantId: req.tenantId,
      userId: req.user._id,
      isDeleted: false,
    });
    if (!label) return res.status(404).json({ success: false, message: "Label not found" });

    label.isDeleted = true;
    await label.save();

    await Notification.updateMany(
      {
        ...baseFilter(req),
        labelIds: { $in: [label._id] },
      },
      {
        $pull: { labelIds: label._id },
      }
    );

    return res.json({ success: true, data: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || "Failed to delete label" });
  }
};
