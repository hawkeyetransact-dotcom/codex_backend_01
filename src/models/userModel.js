// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["supplier", "supplierUser", "buyer", "auditor", "user", "admin", "superadmin", "tenant_admin"], // extend roles
      default: "user",
    },
    adminScope: {
      type: String,
      enum: ["NONE", "TENANT", "PLATFORM"],
      default: "NONE",
      index: true,
    },
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: function () {
        return this.adminScope !== "PLATFORM";
      },
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DISABLED"],
      default: "ACTIVE",
    },
    permissions: {
      type: [String],
      default: [],
    },
    lastLoginAt: { type: Date },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ email: 1, tenant_id: 1 }, { unique: true });

export const User = mongoose.model("users", userSchema);
