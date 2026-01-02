// utils/addNotification.js
import {Notification} from "../models/notificationModel.js";


export const addNotification = async ({
  senderId,
  receiverId,
  senderRole,
  receiverRole,
  message,
  link = ''
}) => {
  try {
    const newNotification = new Notification({
      senderId,
      receiverId,
      senderRole,
      receiverRole,
      message,
      link
    });

    const saved = await newNotification.save();
    console.log("✅ Notification saved:", saved);
  } catch (err) {
    console.error("Error saving notification:", err.message);
  }
};


