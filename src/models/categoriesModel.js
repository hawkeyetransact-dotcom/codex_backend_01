// models/User.js
import mongoose from "mongoose";

const categoriesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    }
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

export const Categories = mongoose.model("categories", categoriesSchema,"categories");
