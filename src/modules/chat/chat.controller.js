import mongoose from "mongoose";
import { asyncHandler } from "../../services/asyncHandler.js";
import { AppError } from "../../services/AppError.js";
import UserModel from "../../../models/User.model.js";
import { Message } from "../../../models/Message.model.js";
import { Chat } from "../../../models/chat.model.js";
import { createNotification } from "../notifications/notifications.service.js";
import {
  MAX_MESSAGE_LIMIT,
  canMutateMessage,
  MESSAGE_MUTATION_WINDOW_MS,
  assertChatParticipant,
  buildParticipantKey,
  createMessage,
  emitToChatParticipants,
  ensureNotBlocked,
  fetchMessagePage,
  getOrCreatePrivateChat,
  getPrivateChat,
  isValidObjectId,
  populateMessage,
  projectMessageForViewer,
  updateLastMessageAfterDelete,
} from "./chat.service.js";
import { deleteCloudinaryAsset } from "../../services/media.service.js";
import env from "../../config/env.js";

export const initChat = asyncHandler(async (req, res) => {
  const currentUserId = req.userId;
  const { sendTo, content = "" } = req.body;

  if (!isValidObjectId(sendTo)) {
    throw new AppError("Recipient is required", 400);
  }

  if (sendTo === currentUserId) {
    throw new AppError("You cannot message yourself", 400);
  }

  const trimmedContent = typeof content === "string" ? content.trim() : "";

  if (trimmedContent.length > env.messageMaxLength) {
    throw new AppError(
      `Message content cannot exceed ${env.messageMaxLength} characters`,
      400
    );
  }

  if (!trimmedContent && !req.file) {
    throw new AppError("Message content or an attachment is required", 400);
  }

  const { currentUser, friend, blocked } = await ensureNotBlocked(currentUserId, sendTo);

  if (blocked) {
    throw new AppError("You cannot message this user", 403);
  }

  // Keep direct messaging limited to an existing friendship.
  if (!currentUser.friends?.some((id) => id.toString() === sendTo.toString())) {
    throw new AppError("You can only message friends", 403);
  }

  const chat = await getOrCreatePrivateChat(currentUserId, sendTo);
  const populatedMessage = await createMessage({
    chat,
    senderId: currentUserId,
    recipientId: sendTo,
    content: trimmedContent,
    file: req.file,
  });
  const messageForViewer = projectMessageForViewer(populatedMessage, currentUserId);

  const io = req.app.get("io");
  await emitToChatParticipants(io, chat, "receiveMessage", {
    chatId: chat._id,
    message: messageForViewer,
  });

  await createNotification({
    io,
    recipient: sendTo,
    actor: currentUserId,
    type: "message",
    title: "New message",
    message: `${req.user.userName} sent you a message.`,
    data: { chatId: chat._id, messageId: populatedMessage._id },
  });

  return res.status(201).json({ success: true, message: messageForViewer });
});

export const getChat = asyncHandler(async (req, res) => {
  const currentUserId = req.userId;
  const friendId = req.body?.friendId;
  const before = req.body?.before;
  const limit = Math.min(
    Math.max(Number(req.body?.limit) || MAX_MESSAGE_LIMIT, 1),
    MAX_MESSAGE_LIMIT
  );

  if (!isValidObjectId(friendId)) {
    throw new AppError("A valid friendId is required", 400);
  }

  const { blocked } = await ensureNotBlocked(currentUserId, friendId);
  if (blocked) throw new AppError("This conversation is unavailable", 403);

  const chat = await getPrivateChat(currentUserId, friendId);
  if (!chat) {
    return res.status(200).json({
      success: true,
      message: "no chat",
      chat: null,
      pagination: { limit, hasMore: false, nextCursor: null },
    });
  }

  assertChatParticipant(chat, currentUserId);
  const page = await fetchMessagePage({ chatId: chat._id, before, limit });
  const viewerMessages = page.messages.map((message) =>
    projectMessageForViewer(message, currentUserId)
  );

  const chatData = {
    ...chat.toObject(),
    messages: viewerMessages,
  };

  return res.status(200).json({
    success: true,
    chat: { _id: chat._id, chat: chatData },
    pagination: {
      limit,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
  });
});

export const getMyChats = asyncHandler(async (req, res) => {
  const currentUserId = new mongoose.Types.ObjectId(req.userId);

  const chats = await Chat.find({
    participants: currentUserId,
  })
    .populate("participants", "userName profileImage email phone isOnline lastSeenAt")
    .populate({
      path: "lastMessage",
      populate: [
        { path: "sendBy", select: "userName profileImage isOnline" },
        { path: "sendTo", select: "userName profileImage isOnline" },
      ],
    })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean();

  const chatIds = chats.map((chat) => chat._id);
  const unreadCounts = chatIds.length
    ? await Message.aggregate([
        {
          $match: {
            chatId: { $in: chatIds },
            sendTo: currentUserId,
            isRead: false,
            isDeleted: false,
          },
        },
        { $group: { _id: "$chatId", count: { $sum: 1 } } },
      ])
    : [];

  const unreadMap = new Map(
    unreadCounts.map((item) => [item._id.toString(), item.count])
  );

  return res.status(200).json({
    success: true,
    chats: chats.map((chat) => ({
      ...chat,
      unreadCount: unreadMap.get(chat._id.toString()) || 0,
    })),
  });
});

const resolveChatForUser = async (userId, chatId) => {
  if (!isValidObjectId(chatId)) return null;
  const chat = await Chat.findOne({ _id: chatId, participants: userId });
  return chat;
};

export const markMessagesAsRead = asyncHandler(async (req, res) => {
  const currentUserId = req.userId;
  const { chatId, userId } = req.body;

  if (userId && userId !== currentUserId) {
    throw new AppError("You can only mark your own messages as read", 403);
  }

  let chat = await resolveChatForUser(currentUserId, chatId);
  if (!chat && isValidObjectId(chatId)) {
    chat = await getPrivateChat(currentUserId, chatId);
  }

  if (!chat) throw new AppError("Chat not found", 404);
  assertChatParticipant(chat, currentUserId);

  const result = await Message.updateMany(
    {
      chatId: chat._id,
      sendTo: currentUserId,
      isRead: false,
      isDeleted: false,
    },
    { $set: { isRead: true } }
  );

  const modifiedCount = result.modifiedCount ?? 0;
  if (modifiedCount) {
    await emitToChatParticipants(req.app.get("io"), chat, "messagesRead", {
      chatId: chat._id,
      readerId: currentUserId,
      modifiedCount,
    });
  }

  return res.json({ success: true, modifiedCount });
});

export const markOneMessagesAsRead = asyncHandler(async (req, res) => {
  const messageId = req.params._id;

  if (!isValidObjectId(messageId)) {
    throw new AppError("Invalid message id", 400);
  }

  const message = await Message.findOne({
    _id: messageId,
    sendTo: req.userId,
    isDeleted: false,
  });

  if (!message) throw new AppError("Message not found", 404);

  if (!message.isRead) {
    message.isRead = true;
    await message.save();

    const chat = await Chat.findById(message.chatId);
    await emitToChatParticipants(req.app.get("io"), chat, "messagesRead", {
      chatId: message.chatId,
      readerId: req.userId,
      messageId: message._id,
    });
  }

  return res.json({ success: true });
});

export const updateMessage = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

  if (!isValidObjectId(id)) throw new AppError("Invalid message id", 400);
  if (!content) throw new AppError("Message content is required", 400);
  if (content.length > env.messageMaxLength) {
    throw new AppError(`Message content cannot exceed ${env.messageMaxLength} characters`, 400);
  }

  const message = await Message.findById(id);
  if (!message) throw new AppError("Message not found", 404);
  if (message.sendBy.toString() !== req.userId) {
    throw new AppError("You can only edit your own messages", 403);
  }
  if (!canMutateMessage(message)) {
    throw new AppError("Messages can only be edited within 30 minutes of sending", 409);
  }
  if (message.isDeleted) throw new AppError("Deleted messages cannot be edited", 400);
  if (message.fileType || message.fileUrl) {
    throw new AppError("Only text messages can be edited", 400);
  }

  message.content = content;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  const chat = await Chat.findById(message.chatId);
  assertChatParticipant(chat, req.userId);

  const populated = await populateMessage(Message.findById(message._id));
  const messageForViewer = projectMessageForViewer(populated, req.userId);

  await emitToChatParticipants(req.app.get("io"), chat, "messageUpdated", {
    message: messageForViewer,
  });

  return res.json({ success: true, message: messageForViewer });
});

export const getStarredMessages = asyncHandler(async (req, res) => {
  const rows = await populateMessage(
    Message.find({
      starredBy: req.userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
  );

  const items = rows.map((message) =>
    projectMessageForViewer(message, req.userId)
  );

  return res.json({
    success: true,
    items,
    count: items.length,
  });
});

export const starMessage = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isValidObjectId(id)) {
    throw new AppError("Invalid message id", 400);
  }

  const message = await Message.findById(id);
  if (!message || message.isDeleted) {
    throw new AppError("Message not found", 404);
  }

  const chat = await Chat.findById(message.chatId);
  assertChatParticipant(chat, req.userId);

  const alreadyStarred = message.starredBy?.some(
    (userId) => userId.toString() === req.userId.toString()
  );

  if (!alreadyStarred) {
    message.starredBy.push(req.userId);
    await message.save();
  }

  const io = req.app.get("io");
  await emitToChatParticipants(io, chat, "messageStarChanged", {
    messageId: message._id,
    chatId: message.chatId,
    userId: req.userId,
    isStarred: true,
  });

  return res.json({
    success: true,
    messageId: message._id,
    isStarred: true,
  });
});

export const unstarMessage = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isValidObjectId(id)) {
    throw new AppError("Invalid message id", 400);
  }

  const message = await Message.findById(id);
  if (!message || message.isDeleted) {
    throw new AppError("Message not found", 404);
  }

  const chat = await Chat.findById(message.chatId);
  assertChatParticipant(chat, req.userId);

  message.starredBy = (message.starredBy || []).filter(
    (userId) => userId.toString() !== req.userId.toString()
  );
  await message.save();

  const io = req.app.get("io");
  await emitToChatParticipants(io, chat, "messageStarChanged", {
    messageId: message._id,
    chatId: message.chatId,
    userId: req.userId,
    isStarred: false,
  });

  return res.json({
    success: true,
    messageId: message._id,
    isStarred: false,
  });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  const id = req.params.id;

  if (!isValidObjectId(id)) throw new AppError("Invalid message id", 400);

  const message = await Message.findById(id);
  if (!message) throw new AppError("Message not found", 404);
  if (message.sendBy.toString() !== req.userId) {
    throw new AppError("You can only delete your own messages", 403);
  }
  if (!canMutateMessage(message)) {
    throw new AppError("Messages can only be deleted within 30 minutes of sending", 409);
  }
  if (message.isDeleted) throw new AppError("Message is already deleted", 409);

  const oldFilePublicId = message.filePublicId;
  const oldFileResourceType = message.fileResourceType;

  message.isDeleted = true;
  message.deletedAt = new Date();
  message.content = "";
  message.fileUrl = null;
  message.filePublicId = null;
  message.fileResourceType = null;
  message.fileType = null;
  await message.save();

  const chat = await Chat.findById(message.chatId);
  assertChatParticipant(chat, req.userId);
  await updateLastMessageAfterDelete(chat);

  await emitToChatParticipants(req.app.get("io"), chat, "messageDeleted", {
    messageId: message._id,
    chatId: message.chatId,
    deletedAt: message.deletedAt,
  });

  if (oldFilePublicId) {
    deleteCloudinaryAsset(oldFilePublicId, oldFileResourceType || "image").catch((error) =>
      console.error("Cloudinary message asset cleanup failed:", error)
    );
  }

  return res.json({
    success: true,
    message: {
      _id: message._id,
      chatId: message.chatId,
      isDeleted: true,
      deletedAt: message.deletedAt,
    },
  });
});
