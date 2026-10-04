import { Notification } from "../../../models/Notification.model.js";
import { emitToUser } from "../../services/socket.events.js";
import UserModel from "../../../models/User.model.js";

const actorProjection = "_id userName profileImage isOnline";

export const createNotification = async ({
  io,
  recipient,
  actor = null,
  type,
  title,
  message,
  data = {},
}) => {
  if (!recipient || !type || !title || !message) return null;

  const preferenceKey = type.startsWith("friend_request") ? "friendRequests"
    : type === "message" || type === "message_edited" || type === "message_deleted" ? "messages"
    : type === "story_view" || type === "story_reaction" ? "stories"
    : type === "call_incoming" ? "calls"
    : type === "scheduled_message" || type === "scheduled_message_sent" || type.startsWith("plan_") ? "scheduledMessages"
    : null;
  const recipientUser = await UserModel.findById(recipient).select("notificationPreferences chatPreferences").lean();
  if (type === "message" && recipientUser?.chatPreferences?.notificationsEnabled === false) return null;
  if (preferenceKey && recipientUser?.notificationPreferences?.[preferenceKey] === false) return null;

  const notification = await Notification.create({
    recipient,
    actor,
    type,
    title,
    message,
    data,
  });

  const populated = await Notification.findById(notification._id)
    .populate("actor", actorProjection)
    .lean();

  emitToUser(io, recipient, "notificationCreated", populated);

  return populated;
};

export const emitNotificationReadAll = (io, recipient, modifiedCount) => {
  emitToUser(io, recipient, "notificationsReadAll", {
    modifiedCount,
  });
};

export const emitNotificationRead = (io, recipient, notificationId) => {
  emitToUser(io, recipient, "notificationRead", {
    notificationId,
  });
};

export const emitNotificationDeleted = (io, recipient, notificationId) => {
  emitToUser(io, recipient, "notificationDeleted", {
    notificationId,
  });
};
