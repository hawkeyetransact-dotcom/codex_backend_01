import mongoose from "mongoose";

const { Schema } = mongoose;

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("SystemSetting", systemSettingSchema);
