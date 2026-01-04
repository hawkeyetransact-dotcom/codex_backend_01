import SequenceCounter from "../models/sequenceCounterModel.js";

export const getNextSequence = async (key) => {
  const updated = await SequenceCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return updated.seq;
};
