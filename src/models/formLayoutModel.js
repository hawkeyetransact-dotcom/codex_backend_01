import mongoose from "mongoose";

const formLayoutSchema = new mongoose.Schema(
  {
    templateId: { type: Number, required: false }, // optional: if omitted, acts as default for category
    categoryName: { type: String, required: true },
    columns: [
      {
        key: { type: String, required: true },
        width: { type: String, default: "1fr" },
      },
    ],
    rows: [
      {
        kind: { type: String, enum: ["header", "subheader", "question"], default: "question" },
        height: { type: String },
        cells: [
          {
            colKey: { type: String, required: true },
            colSpan: { type: Number, default: 1 },
            text: { type: String },
            questionId: { type: mongoose.Schema.Types.ObjectId, ref: "templateQuestions" },
            align: { type: String, default: "left" },
            hideLabel: { type: Boolean, default: false },
          },
        ],
      },
    ],
    style: {
      borderColor: { type: String, default: "#d9534f" },
      headerBg: { type: String, default: "#f5f5f5" },
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

formLayoutSchema.index({ categoryName: 1 });
formLayoutSchema.index({ templateId: 1, categoryName: 1 });

export const FormLayout = mongoose.model("formLayouts", formLayoutSchema, "formLayouts");
