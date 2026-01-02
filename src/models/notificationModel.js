// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole: { type: String, enum: ['buyer', 'auditor', 'supplier'], required: true },
  receiverRole: { type: String, enum: ['buyer', 'auditor', 'supplier'], required: true },
  message: { type: String, required: true },
  link: { type: String, default: '' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const Notification = mongoose.model(
  "notification",
  notificationSchema
);