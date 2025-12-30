import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mongoose from "mongoose";

// Routers
import * as indexRouter from "./src/modules/index.routes.js";

// DB
import connection from "./db/connection.js";

// Error handler
import { globalError } from "./src/services/asyncHandler.js";

// Models
import UserModel from "./models/User.model.js";
import { Message } from "./models/Message.model.js";

/* =======================
   ENV & PATH
======================= */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "./config/.env") });

/* =======================
   APP INIT
======================= */
const app = express();

/* =======================
   MONGOOSE SETTINGS
======================= */
mongoose.set("bufferCommands", false);

/* =======================
   MIDDLEWARES
======================= */
app.use(
  cors({
    origin: "*", // للتجربة – ممكن تحدده لاحقًا
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

/* =======================
   HEALTH CHECK (PING)
======================= */
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

/* =======================
   HTTP & SOCKET.IO
======================= */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:4200",
      "https://ziadal3tar.github.io/chat-fe",
      "https://ziadal3tar.github.io",
    ],
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// خزن io علشان الكنترولرز
app.set("io", io);

// 🟢 Socket Logic
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("userOnline", async (userId) => {
    try {
      socket.userId = userId;

      await UserModel.findByIdAndUpdate(userId, {
        socketId: socket.id,
        isOnline: true,
      });

      console.log(`🟢 ${userId} online`);
    } catch (err) {
      console.error("❌ userOnline error:", err);
    }
  });

  socket.on("markAsRead", async ({ chatId, readerId, friendId }) => {
    try {
      await Message.updateMany(
        { chatId, sendTo: readerId, isRead: false },
        { $set: { isRead: true } }
      );

      const friend = await UserModel.findById(friendId).select("socketId");

      if (friend?.socketId) {
        io.to(friend.socketId).emit("messagesRead", { chatId });
      }
    } catch (err) {
      console.error("❌ markAsRead error:", err);
    }
  });

  socket.on("acceptFriendRequest", ({ fromId, toId }) => {
    io.to(fromId).emit("friendRequestAccepted", { fromId, toId });
  });

  socket.on("disconnect", async () => {
    try {
      if (!socket.userId) return;

      await UserModel.findByIdAndUpdate(socket.userId, {
        socketId: "",
        isOnline: false,
      });

      console.log("🔴 User disconnected:", socket.userId);
    } catch (err) {
      console.error("❌ disconnect error:", err);
    }
  });
});

/* =======================
   ROUTES
======================= */
app.use("/api/auth", indexRouter.authRouter);
app.use("/api/user", indexRouter.userRouter);
app.use("/api/chat", indexRouter.chatRouter);
app.use("/api/friends", indexRouter.friendsRouter);

/* =======================
   GLOBAL ERROR
======================= */
app.use(globalError);


const PORT = process.env.PORT || 3000;

connection()
  .then(() => {
    console.log("✅ MongoDB connected");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
