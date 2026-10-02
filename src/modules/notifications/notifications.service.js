import { Notification } from "../../../models/Notification.model.js";
import { emitToUser } from "../../services/socket.events.js";

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
