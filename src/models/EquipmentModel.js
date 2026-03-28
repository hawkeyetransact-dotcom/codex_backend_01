/**
 * EquipmentModel.js — Equipment/Instrument Master
 * Phase 1 EQMS — ISO 9001:2015 clause 7.1.5 / 21 CFR Part 211.68
 * Module gate: ASSET_MANAGEMENT
 */
import mongoose from "mongoose";

const CalibrationHistorySchema = new mongoose.Schema({
  performedAt: { type: Date, required: true },
  performedBy: { type: String, default: null },
  result: { type: String, enum: ["PASS", "FAIL", "CONDITIONAL"], required: true },
  certificateRef: { type: String, default: null },
  nextDueDate: { type: Date, default: null },
  notes: { type: String, default: null },
}, { _id: true, timestamps: false });

const EquipmentSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },

  // Identity
  equipmentNumber: { type: String, index: true, sparse: true },
  equipmentSequence: { type: Number, sparse: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  equipmentType: {
    type: String,
    enum: ["ANALYTICAL_INSTRUMENT", "PRODUCTION_EQUIPMENT", "UTILITY", "MEASURING_DEVICE", "IT_SYSTEM", "OTHER"],
    default: "MEASURING_DEVICE",
    index: true,
  },

  // Location / assignment
  location: { type: String, default: null },
  department: { type: String, default: null },
  assetTag: { type: String, default: null },
  serialNumber: { type: String, default: null },
  manufacturer: { type: String, default: null },
  model: { type: String, default: null },

  // Lifecycle
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE", "UNDER_CALIBRATION", "OUT_OF_SERVICE", "RETIRED", "QUARANTINED"],
    default: "ACTIVE",
    index: true,
  },

  // Calibration
  requiresCalibration: { type: Boolean, default: true },
  calibrationFrequencyDays: { type: Number, default: 365 },
  lastCalibrationDate: { type: Date, default: null },
  nextCalibrationDue: { type: Date, default: null },
  calibrationStatus: {
    type: String,
    enum: ["CURRENT", "DUE_SOON", "OVERDUE", "NOT_REQUIRED"],
    default: "NOT_REQUIRED",
    index: true,
  },
  calibrationHistory: { type: [CalibrationHistorySchema], default: [] },

  // Ownership
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },

  // Commissioning
  commissionedAt: { type: Date, default: null },
  decommissionedAt: { type: Date, default: null },
  warrantyExpiry: { type: Date, default: null },
}, { timestamps: true });

// Auto-generate equipmentNumber
EquipmentSchema.pre("save", async function (next) {
  if (this.isNew && !this.equipmentNumber) {
    const year = new Date().getFullYear();
    const Model = mongoose.model("equipment-master");
    const count = await Model.countDocuments({ tenantId: this.tenantId }) + 1;
    this.equipmentSequence = count;
    this.equipmentNumber = `EQ-${year}-${String(count).padStart(4, "0")}`;
  }
  next();
});

EquipmentSchema.index({ tenantId: 1, status: 1 });
EquipmentSchema.index({ tenantId: 1, calibrationStatus: 1 });
EquipmentSchema.index({ tenantId: 1, nextCalibrationDue: 1 });

export const Equipment = mongoose.model("equipment-master", EquipmentSchema);
