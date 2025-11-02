import { Chat } from "../../../models/chat.model.js";
import { Message } from "../../../models/Message.model.js";
import UserModel from "../../../models/User.model.js";
import cloudinary from "../../services/cloudinary.js";
import fs from "fs";
export const initChat = async (req, res) => {
  try {
    const { sendBy, sendTo, content, date, time } = req.body;
    let fileUrl = null;
    let fileType = null;

    if (!sendBy || !sendTo) {
      return res.status(400).json({ success: false, message: "Missing user IDs" });
    }

    // ✅ ابحث أو أنشئ الشات
    let chat = await Chat.findOne({
      participants: { $all: [sendBy, sendTo] },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [sendBy, sendTo],
        messages: [],
      });
    }

    // ✅ لو في ملف
    if (req.file) {
      const mime = req.file.mimetype;

      if (mime.startsWith("image/")) fileType = "image";
      else if (mime.startsWith("video/")) fileType = "video";
      else if (mime === "application/pdf") fileType = "pdf";
      else {
        return res.status(400).json({
          success: false,
          message: "Unsupported file type",
        });
      }

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: fileType === "video" ? "video" : "auto",
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
        stream.end(req.file.buffer);
      });

      fileUrl = uploadResult.secure_url;
    }

    // ✅ إنشاء الرسالة
    const newMessage = await Message.create({
      chatId: chat._id,
      sendBy,
      sendTo,
      content,
      date,
      time,
      fileUrl,
      fileType,
      isRead: false,
    });

    // ✅ تحديث الشات
    chat.messages.push(newMessage._id);
    chat.lastMessage = newMessage._id;
    await chat.save();

    await Promise.all([
      UserModel.findByIdAndUpdate(sendBy, { $addToSet: { chats: chat._id } }),
      UserModel.findByIdAndUpdate(sendTo, { $addToSet: { chats: chat._id } }),
    ]);
  const sendToSocket = await UserModel.findById(sendTo).select('socketId');

    // ✅ إرسال سوكيت للطرف المستلم
    const io = req.app.get("io"); // لازم تكون معرف io في server.js
    console.log('fggf',sendToSocket);
    
    if (io) {
      io.to(sendToSocket.socketId).emit("receiveMessage", {
        message: newMessage,
      });
    }

    return res.status(200).json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    console.error("❌ Send message error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};




export const getChat = async (req, res) => {
  try {
    const { myId, friendId } = req.body;

    // ✅ ابحث عن الشات بين المستخدمين
    const chat = await Chat.findOne({
      participants: { $all: [myId, friendId] },
    }).populate({
      path: 'messages',
      populate: [
        {
          path: 'sendBy',
          model: 'User',
          select: 'userName email profileImage',

        },
        {
          path: 'sendTo',
          model: 'User',
          select: 'userName email profileImage',

        },
      ],

    });

    if (!chat) {
      return res.status(200).json({ message: 'no chat' }); // مفيش شات لسه
    }



    // ✅ رجّع البيانات
    res.status(200).json({
      chat: {
        _id: chat._id,
        chat
      },
    });
  } catch (error) {
    console.error("Error in getChat:", error);
    res.status(500).json({ message: "Server error" });
  }
};



export const getMyChats = async (req, res) => {
  try {
    const { userId } = req.body; // ID المستخدم الحالي

    // ✅ ابحث عن كل الشاتات اللي المستخدم مشارك فيها
    const chats = await Chat.find({ participants: userId })
      .populate("participants", "userName profileImage email phone")
      .populate("lastMessage") // جلب بيانات الطرفين
      .sort({ updatedAt: -1 }); // الأحدث أولاً

    res.status(200).json({
      success: true,
      chats,
    });
  } catch (error) {
    console.error("Error in getMyChats:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// markMessagesAsRead.js
export const markMessagesAsRead = async (req, res) => {
  try {
    const { chatId, userId } = req.body;

    await Message.updateMany(
  { chatId, sendTo: userId, isRead: false },
  { $set: { isRead: true } }
);


    res.json({ success: true });
  } catch (err) {
    console.error("Error marking messages as read:", err);
    res.status(500).json({ success: false });
  }
};
export const markOneMessagesAsRead = async (req, res) => {
  try {
    const { _id } = req.params;
    await Message.updateOne(
  { _id },
  { $set: { isRead: true } }
);
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking message as read:", err);
    res.status(500).json({ success: false });
  }
};