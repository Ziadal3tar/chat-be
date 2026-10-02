import jwt from "jsonwebtoken";
import UserModel from "../../models/User.model.js";
import { Chat } from "../../models/chat.model.js";
import { Message } from "../../models/Message.model.js";
import { CHAT_SOCKET_EVENTS } from "../services/chatMessageEvents.js";
import env from "../config/env.js";

const USER_ROOM = (userId) => `user:${userId}`;

// Single-node presence registry. For multi-instance deployments this should be moved to Redis.
const activeSocketsByUser = new Map();

const normalizeToken = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
};

const isValidObjectId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ""));

async function setOnline(io, userId, socketId) {
  let sockets = activeSocketsByUser.get(userId);
  if (!sockets) {
    sockets = new Set();
    activeSocketsByUser.set(userId, sockets);
  }

  const wasOffline = sockets.size === 0;
  sockets.add(socketId);

  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      socketId,
      isOnline: true,
    },
    { new: true }
  ).select("_id friends socketId isOnline");

  if (!user) return;

  io.sockets.sockets.get(socketId)?.join(USER_ROOM(userId));

  if (!wasOffline) return;

  for (const friendId of user.friends || []) {
    io.to(USER_ROOM(friendId.toString())).emit(CHAT_SOCKET_EVENTS.PRESENCE_CHANGED, {
      userId,
      isOnline: true,
    });
  }
}

async function setOffline(io, userId, socketId) {
  const sockets = activeSocketsByUser.get(userId);

  if (sockets) {
    sockets.delete(socketId);

    if (sockets.size > 0) {
      return;
    }

    activeSocketsByUser.delete(userId);
  }

  const user = await UserModel.findById(userId).select("_id friends");
  if (!user) return;

  await UserModel.updateOne(
    { _id: userId },
    { $set: { socketId: "", isOnline: false, lastSeenAt: new Date() } }
  );

  for (const friendId of user.friends || []) {
    io.to(USER_ROOM(friendId.toString())).emit(CHAT_SOCKET_EVENTS.PRESENCE_CHANGED, {
      userId,
      isOnline: false,
    });
  }
}

async function resolveChat(userId, chatId, friendId) {
  if (chatId && isValidObjectId(chatId)) {
    const chat = await Chat.findOne({
      _id: chatId,
      participants: userId,
    });
    if (chat) return chat;
  }

  if (friendId && isValidObjectId(friendId)) {
    return Chat.findOne({
      participants: { $all: [userId, friendId], $size: 2 },
    });
  }

  return null;
}

export const initializeSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = normalizeToken(socket.handshake.auth?.token);

      if (!token) {
        return next(new Error("Authentication token is required"));
      }

      const decoded = jwt.verify(token, env.jwtSecret);
      if (!decoded?.id || !isValidObjectId(decoded.id)) {
        return next(new Error("Invalid authentication token"));
      }

      const user = await UserModel.findById(decoded.id).select("-password");
      if (!user) {
        return next(new Error("User no longer exists"));
      }

      socket.user = user;
      socket.userId = user._id.toString();
      next();
    } catch (error) {
      next(new Error("Token is invalid or expired"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;

    try {
      await setOnline(io, userId, socket.id);
    } catch (error) {
      console.error("Socket online state error:", error);
    }

    // Backward compatibility with the previous client. The payload is ignored
    // because the authenticated socket already determines the real user.
    socket.on("join", async () => {
      socket.join(USER_ROOM(userId));
      await setOnline(io, userId, socket.id);
    });

    socket.on("userOnline", async () => {
      try {
        await setOnline(io, userId, socket.id);
      } catch (error) {
        console.error("userOnline error:", error);
      }
    });


    const emitToUserRoom = (targetUserId, event, payload = {}) => {
      if (!isValidObjectId(targetUserId)) return;
      io.to(USER_ROOM(targetUserId.toString())).emit(event, payload);
    };

    const canCallUser = async (targetUserId) => {
      if (!isValidObjectId(targetUserId) || targetUserId === userId) return false;
      const pair = await UserModel.find({ _id: { $in: [userId, targetUserId] } })
        .select("_id friends blockedUsers")
        .lean();
      if (pair.length !== 2) return false;
      const me = pair.find((user) => user._id.toString() === userId);
      const target = pair.find((user) => user._id.toString() === targetUserId);
      if (!me || !target) return false;
      const friends = (me.friends || []).some((id) => id.toString() === targetUserId);
      const blocked =
        (me.blockedUsers || []).some((id) => id.toString() === targetUserId) ||
        (target.blockedUsers || []).some((id) => id.toString() === userId);
      return friends && !blocked;
    };

    socket.on("call:invite", async (payload = {}) => {
      try {
        const targetUserId = String(payload.toUserId || "");
        if (!(await canCallUser(targetUserId))) return;
        emitToUserRoom(targetUserId, "incomingCall", {
          callId: payload.callId,
          fromUserId: userId,
          fromUserName: socket.user?.userName || "Friend",
          fromProfileImage: socket.user?.profileImage || "",
          type: payload.type === "video" ? "video" : "audio",
          offer: payload.offer,
        });
      } catch (error) {
        console.error("Socket call invite error:", error);
      }
    });

    socket.on("call:accept", (payload = {}) => {
      emitToUserRoom(payload.toUserId, "callAccepted", {
        callId: payload.callId,
        fromUserId: userId,
        answer: payload.answer,
      });
    });

    socket.on("call:ice", (payload = {}) => {
      emitToUserRoom(payload.toUserId, "callIceCandidate", {
        callId: payload.callId,
        fromUserId: userId,
        candidate: payload.candidate,
      });
    });

    socket.on("call:end", (payload = {}) => {
      emitToUserRoom(payload.toUserId, "callEnded", {
        callId: payload.callId,
        fromUserId: userId,
        reason: payload.reason || "ended",
      });
    });

    socket.on("markAsRead", async (payload = {}) => {
      try {
        const chat = await resolveChat(userId, payload.chatId, payload.friendId);

        if (!chat) return;

        const result = await Message.updateMany(
          {
            chatId: chat._id,
            sendTo: userId,
            isRead: false,
            isDeleted: false,
          },
          { $set: { isRead: true } }
        );

        const modifiedCount = result.modifiedCount ?? result.nModified ?? 0;

        if (!modifiedCount) return;

        const eventPayload = {
          chatId: chat._id,
          readerId: userId,
          modifiedCount,
        };

        for (const participantId of chat.participants) {
          io.to(USER_ROOM(participantId.toString())).emit(
            CHAT_SOCKET_EVENTS.MESSAGES_READ,
            eventPayload
          );
        }
      } catch (error) {
        console.error("Socket markAsRead error:", error);
      }
    });

    socket.on("disconnect", async () => {
      try {
        await setOffline(io, userId, socket.id);
      } catch (error) {
        console.error("Socket offline state error:", error);
      }
    });
  });

  return io;
};
