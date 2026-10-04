import mongoose from "mongoose";
import { Chat } from "../../../models/chat.model.js";
import { Message } from "../../../models/Message.model.js";
import UserModel from "../../../models/User.model.js";
import { AppError } from "../../services/AppError.js";
import { uploadMessageMedia } from "../../services/media.service.js";
import { emitToUsers } from "../../services/socket.events.js";

export const MAX_MESSAGE_LIMIT = 100;
export const MESSAGE_MUTATION_WINDOW_MS = 30 * 60 * 1000;

export const canMutateMessage = (message, now = Date.now()) => {
  if (!message?.createdAt) return false;
  return now - new Date(message.createdAt).getTime() <= MESSAGE_MUTATION_WINDOW_MS;
};

export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export const buildParticipantKey = (firstUserId, secondUserId) =>
  [firstUserId.toString(), secondUserId.toString()].sort().join(":");

export const buildDateParts = () => {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-GB"),
    time: now.toLocaleTimeString("en-US", { hour12: false }),
  };
};

export const getPrivateChat = async (userId, friendId) => {
  const participantKey = buildParticipantKey(userId, friendId);
  const keyedChat = await Chat.findOne({ participantKey });
  if (keyedChat) return keyedChat;

  const legacyChat = await Chat.findOne({
    participants: { $all: [userId, friendId], $size: 2 },
  });

  if (!legacyChat) return null;

  if (!legacyChat.participantKey) {
    legacyChat.participantKey = participantKey;
    try {
      await legacyChat.save();
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  return legacyChat;
};

export const ensureNotBlocked = async (userId, friendId) => {
  const users = await UserModel.find({ _id: { $in: [userId, friendId] } })
    .select("blockedUsers friends")
    .lean();
  const currentUser = users.find((user) => user._id.toString() === userId.toString());
  const friend = users.find((user) => user._id.toString() === friendId.toString());

  if (!currentUser || !friend) {
    throw new AppError("User not found", 404);
  }

  const blocked =
    currentUser.blockedUsers?.some((id) => id.toString() === friendId.toString()) ||
    friend.blockedUsers?.some((id) => id.toString() === userId.toString());

  return { currentUser, friend, blocked };
};

export const assertChatParticipant = (chat, userId) => {
  if (!chat || !chat.participants.some((id) => id.toString() === userId.toString())) {
    throw new AppError("You are not a member of this chat", 403);
  }
};

export const getOrCreatePrivateChat = async (userId, friendId) => {
  const participantKey = buildParticipantKey(userId, friendId);
  const existing = await getPrivateChat(userId, friendId);
  if (existing) return existing;

  try {
    return await Chat.findOneAndUpdate(
      { participantKey },
      {
        $setOnInsert: {
          participants: [userId, friendId],
          participantKey,
          lastMessage: null,
          lastMessageAt: null,
          messages: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return Chat.findOne({ participantKey });
  }
};

export const emitToChatParticipants = async (io, chat, event, payload) => {
  if (!io || !chat) return;
  emitToUsers(io, chat.participants, event, payload);
};

export const populateMessage = (query) =>
  query.populate([
    {
      path: "replyTo",
      model: "Message",
      select: "content fileUrl fileType sendBy createdAt",
      populate: { path: "sendBy", model: "User", select: "userName profileImage" },
    },
    {
      path: "sendBy",
      model: "User",
      select: "userName email profileImage isOnline",
    },
    {
      path: "sendTo",
      model: "User",
      select: "userName email profileImage isOnline privacyPreferences",
    },
  ]);

/**
 * Return a message safe for the current viewer.
 * The raw starredBy list is intentionally not exposed to the client.
 */
export const projectMessageForViewer = (message, viewerId) => {
  if (!message) return message;

  const raw = typeof message.toObject === "function"
    ? message.toObject()
    : { ...message };

  const starredBy = Array.isArray(raw.starredBy) ? raw.starredBy : [];
  raw.isStarred = starredBy.some(
    (id) => id?.toString() === viewerId?.toString()
  );
  const pinnedBy = Array.isArray(raw.pinnedBy) ? raw.pinnedBy : [];
  raw.isPinned = pinnedBy.some((id) => id?.toString() === viewerId?.toString());
  raw.reactionCounts = Array.isArray(raw.reactions)
    ? raw.reactions.reduce((acc, item) => {
        if (item?.emoji) acc[item.emoji] = (acc[item.emoji] || 0) + 1;
        return acc;
      }, {})
    : {};
  raw.myReaction = Array.isArray(raw.reactions)
    ? raw.reactions.find((item) => item?.user?.toString() === viewerId?.toString())?.emoji || null
    : null;

  // If the recipient disabled read receipts, never expose the persisted
  // read state back to the sender. This keeps privacy behavior consistent
  // after a page refresh.
  const senderId = raw.sendBy?._id?.toString?.() || raw.sendBy?.toString?.();
  const recipientReadReceipts = raw.sendTo?.privacyPreferences?.readReceipts;
  if (senderId === viewerId?.toString() && recipientReadReceipts === false) {
    raw.isRead = false;
  }

  if (raw.sendTo && typeof raw.sendTo === "object") {
    delete raw.sendTo.privacyPreferences;
  }

  delete raw.starredBy;
  delete raw.pinnedBy;
  delete raw.reactions;
  return raw;
};

export const createMessage = async ({ chat, senderId, recipientId, content, file, replyTo = null }) => {
  let media = null;

  if (file) {
    media = await uploadMessageMedia(file);
  }

  const { date, time } = buildDateParts();
  const message = await Message.create({
    chatId: chat._id,
    sendBy: senderId,
    sendTo: recipientId,
    content,
    replyTo: replyTo || null,
    date,
    time,
    fileUrl: media?.url || null,
    filePublicId: media?.publicId || null,
    fileResourceType: media?.resourceType || null,
    fileType: media?.fileType || null,
    isRead: false,
  });

  chat.lastMessage = message._id;
  chat.lastMessageAt = message.createdAt;
  await chat.save();

  await Promise.all([
    UserModel.updateOne(
      { _id: senderId },
      { $addToSet: { chats: chat._id } }
    ),
    UserModel.updateOne(
      { _id: recipientId },
      { $addToSet: { chats: chat._id } }
    ),
  ]);

  return populateMessage(Message.findById(message._id));
};

export const encodeCursor = (createdAt, id) =>
  Buffer.from(JSON.stringify({
    createdAt: new Date(createdAt).toISOString(),
    id: id.toString(),
  })).toString("base64url");

export const decodeCursor = (value) => {
  if (!value) return null;

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded?.createdAt || !isValidObjectId(decoded.id)) return null;
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: new mongoose.Types.ObjectId(decoded.id) };
  } catch {
    const legacyDate = new Date(value);
    return Number.isNaN(legacyDate.getTime()) ? null : { createdAt: legacyDate, id: null };
  }
};

export const fetchMessagePage = async ({ chatId, before, limit }) => {
  const filter = {
    chatId,
  };

  const cursor = decodeCursor(before);
  if (cursor?.id) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ];
  } else if (cursor?.createdAt) {
    filter.createdAt = { $lt: cursor.createdAt };
  }

  const rows = await populateMessage(
    Message.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
  );

  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();
  const oldest = messages[0];

  return {
    messages,
    hasMore,
    nextCursor:
      hasMore && oldest
        ? encodeCursor(oldest.createdAt, oldest._id)
        : null,
  };
};

export const updateLastMessageAfterDelete = async (chat) => {
  if (!chat?.lastMessage) return;

  const latest = await Message.findOne({
    chatId: chat._id,
    isDeleted: false,
  }).sort({ createdAt: -1, _id: -1 });

  chat.lastMessage = latest?._id || null;
  chat.lastMessageAt = latest?.createdAt || null;
  await chat.save();
};
