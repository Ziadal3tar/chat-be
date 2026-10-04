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
import { emitToUser } from "../../services/socket.events.js";

export const initChat = asyncHandler(async (req, res) => {
  const currentUserId = req.userId;
  const { sendTo, content = "", replyTo = null } = req.body;

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
  let validatedReplyTo = null;
  if (replyTo) {
    if (!isValidObjectId(replyTo)) throw new AppError("Invalid reply message", 400);
    const replyMessage = await Message.findOne({ _id: replyTo, chatId: chat._id, isDeleted: false }).select("_id").lean();
    if (!replyMessage) throw new AppError("Reply message not found", 404);
    validatedReplyTo = replyMessage._id;
  }
  const populatedMessage = await createMessage({
    chat,
    senderId: currentUserId,
    recipientId: sendTo,
    content: trimmedContent,
    file: req.file,
    replyTo: validatedReplyTo,
  });
  const messageForViewer = projectMessageForViewer(populatedMessage, currentUserId);

  const io = req.app.get("io");
  // The sender already receives the authoritative message from this HTTP response.
  // Emit the realtime copy only to the recipient to avoid response/socket races and duplicates.
  emitToUser(io, sendTo, "receiveMessage", {
    chatId: chat._id,
    message: messageForViewer,
    source: "realtime",
  });

  const recipientPrefs = await UserModel.findById(sendTo).select("notificationPreferences chatPreferences").lean();
  const recipientMuted = Array.isArray(chat.mutedBy) && chat.mutedBy.some((id) => id.toString() === sendTo.toString());
  if (!recipientMuted && recipientPrefs?.notificationPreferences?.messages !== false && recipientPrefs?.chatPreferences?.notificationsEnabled !== false) {
    await createNotification({
      io,
      recipient: sendTo,
    actor: currentUserId,
    type: "message",
    title: "New message",
    message: `${req.user.userName} sent you a message.`,
      data: { chatId: chat._id, messageId: populatedMessage._id },
    });
  }

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
        { path: "sendTo", select: "userName profileImage isOnline privacyPreferences" },
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
    chats: chats.map((chat) => {
      const lastMessage = chat.lastMessage
        ? { ...chat.lastMessage }
        : null;
      const lastMessageSenderId = lastMessage?.sendBy?._id?.toString?.() || lastMessage?.sendBy?.toString?.();
      if (lastMessage && lastMessageSenderId === req.userId.toString() && lastMessage.sendTo?.privacyPreferences?.readReceipts === false) {
        lastMessage.isRead = false;
      }
      if (lastMessage?.sendTo && typeof lastMessage.sendTo === "object") {
        delete lastMessage.sendTo.privacyPreferences;
      }

      return {
        ...chat,
        lastMessage,
        unreadCount: unreadMap.get(chat._id.toString()) || 0,
        isPinned: (chat.pinnedBy || []).some((id) => id.toString() === req.userId.toString()),
        isMuted: (chat.mutedBy || []).some((id) => id.toString() === req.userId.toString()),
        pinnedBy: undefined,
        mutedBy: undefined,
      };
    }),
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

  const unreadRows = await Message.find({
    chatId: chat._id,
    sendTo: currentUserId,
    isRead: false,
    isDeleted: false,
  }).select("_id").lean();

  const messageIds = unreadRows.map((row) => row._id);
  const result = messageIds.length
    ? await Message.updateMany(
        { _id: { $in: messageIds }, isRead: false },
        { $set: { isRead: true } }
      )
    : { modifiedCount: 0 };

  const modifiedCount = result.modifiedCount ?? 0;
  if (modifiedCount) {
    const reader = await UserModel.findById(currentUserId).select("privacyPreferences.readReceipts").lean();
    if (reader?.privacyPreferences?.readReceipts !== false) {
      await emitToChatParticipants(req.app.get("io"), chat, "messagesRead", {
        chatId: chat._id,
        readerId: currentUserId,
        messageIds,
        modifiedCount,
      });
    }
  }

  return res.json({ success: true, modifiedCount, messageIds });
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
    const reader = await UserModel.findById(req.userId).select("privacyPreferences.readReceipts").lean();
    if (reader?.privacyPreferences?.readReceipts !== false) {
      await emitToChatParticipants(req.app.get("io"), chat, "messagesRead", {
        chatId: message.chatId,
        readerId: req.userId,
        messageIds: [message._id],
        messageId: message._id,
      });
    }
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

  const chatIds = [...new Set(rows.map((message) => message.chatId?.toString()).filter(Boolean))];
  const chats = chatIds.length
    ? await Chat.find({ _id: { $in: chatIds } })
        .select("_id participants")
        .populate("participants", "userName profileImage isOnline")
        .lean()
    : [];

  const chatMap = new Map(chats.map((chat) => [chat._id.toString(), chat]));

  const items = rows.map((message) => {
    const sender = message.sendBy && typeof message.sendBy === "object" ? message.sendBy : null;
    const recipient = message.sendTo && typeof message.sendTo === "object" ? message.sendTo : null;
    const participants = Array.isArray(chatMap.get(message.chatId?.toString())?.participants)
      ? chatMap.get(message.chatId?.toString())?.participants
      : [];
    const friend = sender?._id?.toString() === req.userId.toString()
      ? (recipient || participants.find((participant) => participant?._id?.toString() !== req.userId.toString()))
      : (sender || participants.find((participant) => participant?._id?.toString() !== req.userId.toString()));
    const chat = chatMap.get(message.chatId?.toString());

    let text = message.content || "";
    if (!text) {
      if (message.fileType === "image") text = "Image";
      else if (message.fileType === "video") text = "Video";
      else if (message.fileType === "audio") text = "Voice message";
      else if (message.fileType === "pdf") text = "PDF document";
      else text = "Saved message";
    }

    const projected = projectMessageForViewer(message, req.userId);
    return {
      ...projected,
      text,
      name: friend?.userName || "Friend",
      image: friend?.profileImage || "",
      friendId: friend?._id || null,
      friendName: friend?.userName || "Friend",
      friendProfileImage: friend?.profileImage || "",
      senderName: sender?.userName || "You",
      senderProfileImage: sender?.profileImage || "",
      recipientName: recipient?.userName || friend?.userName || "Friend",
      direction: sender?._id?.toString() === req.userId.toString() ? "You sent" : "Received from",
      replyPreview: projected?.replyTo?.content || projected?.replyTo?.fileType || null,
      chatId: message.chatId,
      chatExists: !!chat,
    };
  });

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

export const searchMessages = asyncHandler(async (req, res) => {
  const chatId = req.query?.chatId;
  const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Math.max(Number(req.query?.limit) || 20, 1), 50);
  if (!isValidObjectId(chatId) || !q) throw new AppError("chatId and search query are required", 400);
  const chat = await Chat.findOne({ _id: chatId, participants: req.userId }).lean();
  if (!chat) throw new AppError("Chat not found", 404);
  const regex = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rows = await populateMessage(Message.find({ chatId, isDeleted: false, content: { $regex: regex, $options: "i" } }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean());
  return res.json({ success: true, messages: rows.map((row) => projectMessageForViewer(row, req.userId)) });
});

export const toggleMessageReaction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim().slice(0, 8) : "";
  if (!isValidObjectId(id) || !emoji) throw new AppError("A valid message id and emoji are required", 400);
  const message = await Message.findById(id);
  if (!message || message.isDeleted) throw new AppError("Message not found", 404);
  const chat = await Chat.findById(message.chatId);
  assertChatParticipant(chat, req.userId);
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const existing = reactions.find((r) => r.user.toString() === req.userId.toString());
  if (existing) {
    if (existing.emoji === emoji) message.reactions = reactions.filter((r) => r.user.toString() !== req.userId.toString());
    else existing.emoji = emoji;
  } else {
    message.reactions.push({ user: req.userId, emoji });
  }
  await message.save();
  const populated = await populateMessage(Message.findById(message._id));
  const payload = { message: projectMessageForViewer(populated, req.userId), messageId: message._id, chatId: message.chatId };
  await emitToChatParticipants(req.app.get("io"), chat, "messageReactionChanged", payload);
  return res.json({ success: true, ...payload });
});

export const toggleMessagePin = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!isValidObjectId(id)) throw new AppError("Invalid message id", 400);
  const message = await Message.findById(id);
  if (!message || message.isDeleted) throw new AppError("Message not found", 404);
  const chat = await Chat.findById(message.chatId);
  assertChatParticipant(chat, req.userId);
  const pinned = (message.pinnedBy || []).some((value) => value.toString() === req.userId.toString());
  if (pinned) message.pinnedBy = message.pinnedBy.filter((value) => value.toString() !== req.userId.toString());
  else message.pinnedBy.push(req.userId);
  await message.save();
  const isPinned = !pinned;
  await emitToChatParticipants(req.app.get("io"), chat, "messagePinChanged", { messageId: message._id, chatId: message.chatId, userId: req.userId, isPinned });
  return res.json({ success: true, messageId: message._id, isPinned });
});

export const toggleChatPin = asyncHandler(async (req, res) => {
  const chatId = req.params.id;
  const chat = await Chat.findOne({ _id: chatId, participants: req.userId });
  if (!chat) throw new AppError("Chat not found", 404);
  const pinned = (chat.pinnedBy || []).some((value) => value.toString() === req.userId.toString());
  if (pinned) chat.pinnedBy = chat.pinnedBy.filter((value) => value.toString() !== req.userId.toString());
  else chat.pinnedBy.push(req.userId);
  await chat.save();
  return res.json({ success: true, isPinned: !pinned, chatId: chat._id });
});

export const toggleChatMute = asyncHandler(async (req, res) => {
  const chatId = req.params.id;
  const chat = await Chat.findOne({ _id: chatId, participants: req.userId });
  if (!chat) throw new AppError("Chat not found", 404);
  const muted = (chat.mutedBy || []).some((value) => value.toString() === req.userId.toString());
  if (muted) chat.mutedBy = chat.mutedBy.filter((value) => value.toString() !== req.userId.toString());
  else chat.mutedBy.push(req.userId);
  await chat.save();
  return res.json({ success: true, isMuted: !muted, chatId: chat._id });
});

export const getPinnedMessages = asyncHandler(async (req, res) => {
  const chatId = req.query?.chatId;
  if (!isValidObjectId(chatId)) throw new AppError("Valid chatId is required", 400);
  const chat = await Chat.findOne({ _id: chatId, participants: req.userId }).lean();
  if (!chat) throw new AppError("Chat not found", 404);
  const rows = await populateMessage(Message.find({ chatId, pinnedBy: req.userId, isDeleted: false }).sort({ createdAt: -1 }).limit(100).lean());
  return res.json({ success: true, messages: rows.map((row) => projectMessageForViewer(row, req.userId)) });
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
