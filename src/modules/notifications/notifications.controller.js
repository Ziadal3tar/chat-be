import mongoose from "mongoose";
import { asyncHandler } from "../../services/asyncHandler.js";
import { Notification } from "../../../models/Notification.model.js";
import {
  emitNotificationDeleted,
  emitNotificationRead,
  emitNotificationReadAll,
} from "./notifications.service.js";

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const getNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipient: req.userId })
      .populate("actor", "_id userName profileImage isOnline")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ recipient: req.userId }),
    Notification.countDocuments({ recipient: req.userId, isRead: false }),
  ]);

  return res.status(200).json({
    success: true,
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    unreadCount,
  });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipient: req.userId,
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    unreadCount,
  });
});

export const markAsRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  if (!isValidObjectId(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Notification id is invalid",
    });
  }

  const notification = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      recipient: req.userId,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found or already read",
    });
  }

  const io = req.app.get("io");
  emitNotificationRead(io, req.userId, notification._id);

  return res.status(200).json({
    success: true,
    notification,
  });
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    {
      recipient: req.userId,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    }
  );

  const modifiedCount = result.modifiedCount ?? result.nModified ?? 0;
  const io = req.app.get("io");
  emitNotificationReadAll(io, req.userId, modifiedCount);

  return res.status(200).json({
    success: true,
    modifiedCount,
  });
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  if (!isValidObjectId(notificationId)) {
    return res.status(400).json({
      success: false,
      message: "Notification id is invalid",
    });
  }

  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    recipient: req.userId,
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: "Notification not found",
    });
  }

  const io = req.app.get("io");
  emitNotificationDeleted(io, req.userId, notificationId);

  return res.status(200).json({
    success: true,
    message: "Notification deleted successfully",
    notificationId,
  });
});
