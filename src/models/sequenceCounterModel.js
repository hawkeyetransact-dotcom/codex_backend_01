import mongoose from "mongoose";

const SequenceCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

SequenceCounterSchema.index({ key: 1 }, { unique: true });

const SequenceCounter = mongoose.model("sequence_counters", SequenceCounterSchema);
export default SequenceCounter;
