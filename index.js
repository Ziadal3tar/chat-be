import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import * as indexRouter from './src/modules/index.routes.js';
import connection from './db/connection.js';
import { globalError } from './src/services/asyncHandler.js';
import UserModel from './models/User.model.js';
import { Message } from './models/Message.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, './config/.env') });

const app = express();
import cors from 'cors';
app.use(cors({
  origin: ["http://localhost:4200", "https://ziadal3tar.github.io/chat-fe", "https://ziadal3tar.github.io/"], 
  methods: ['GET','POST']
}));
app.use(express.json());

connection();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:4200", "https://ziadal3tar.github.io/chat-fe", "https://ziadal3tar.github.io/"], 
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"] // مهم مع Railway
});
app.set("onlineUsers", new Map());
// 🟢 Socket.IO logic


// 🧩 ضيف io في app علشان تقدر تستخدمه في الكنترولرز
app.set("io", io);


io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // ✅ أول لما المستخدم يبعت userOnline
  socket.on("userOnline", async (userId) => {

    try {
      // 🟢 خزّن userId داخل الـ socket نفسه
      socket.userId = userId;

      // ✅ خزّن الـ socketId في الداتابيز
      await UserModel.findByIdAndUpdate(userId, {
        socketId: socket.id,
        isOnline: true,
      });

      console.log(`🟢 ${userId} is now online with socket ${socket.id}`);
    } catch (err) {
      console.error("❌ Error updating user socketId:", err);
    }
  });

 socket.on("markAsRead", async ({ chatId, readerId, friendId }) => {
    try {
      // علّم كل الرسائل اللي بعتها صديقك كمقروءة
      await Message.updateMany(
        { chatId, sendTo: readerId, isRead: false },
        { $set: { isRead: true } }
      );

      // رجّع socketId بتاع المرسل
      const friend = await UserModel.findById(friendId).select("socketId");
      if (friend?.socketId) {
        io.to(friend.socketId).emit("messagesRead", { chatId });
      }
    } catch (err) {
      console.error("❌ Error in markAsRead:", err);
    }
  });

 socket.on('acceptFriendRequest', ({ fromId, toId }) => {
    io.to(fromId).emit('friendRequestAccepted', { fromId, toId });
  });
  // 🟥 عند انقطاع الاتصال
  socket.on("disconnect", async () => {
    try {
      const userId = socket.userId; // ✅ استرجع userId من الـ socket
      if (!userId) return; // لو مش موجود، تجاهل

      await UserModel.findByIdAndUpdate(userId, {
        socketId: "",
        isOnline: false,
      });

      console.log("🔴 User disconnected:", userId);
    } catch (err) {
      console.error("❌ Error updating user socketId:", err);
    }
  });
});



app.use('/api/auth', indexRouter.authRouter);
app.use('/api/user', indexRouter.userRouter);
app.use('/api/chat', indexRouter.chatRouter);
app.use('/api/friends', indexRouter.friendsRouter);
app.use(globalError);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
