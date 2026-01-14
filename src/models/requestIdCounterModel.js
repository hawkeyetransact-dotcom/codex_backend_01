import mongoose from "mongoose";

const requestIdCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const RequestIdCounter = mongoose.model("request_id_counters", requestIdCounterSchema);
