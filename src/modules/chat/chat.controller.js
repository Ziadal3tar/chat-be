import { Chat } from "../../../models/chat.model.js";
import { Message } from "../../../models/Message.model.js";
import UserModel from "../../../models/User.model.js";

export const initChat = async (req, res) => {
  try {
    const { sendBy, sendTo, content, date, time } = req.body;


    // 🟢 1️⃣ ابحث عن الشات بين الطرفين
    let chat = await Chat.findOne({
      participants: { $all: [sendBy, sendTo] },
    });

    // 🟢 2️⃣ لو الشات مش موجود، أنشئ شات جديد وحدث المستخدمين
    if (!chat) {
      chat = await Chat.create({ participants: [sendBy, sendTo], messages: [] });

      await Promise.all([
        UserModel.findByIdAndUpdate(sendBy, { $addToSet: { chats: chat._id } }),
        UserModel.findByIdAndUpdate(sendTo, { $addToSet: { chats: chat._id } }),
      ]);
    }

    // 🟢 3️⃣ إنشاء الرسالة الجديدة
    const message = await Message.create({
      chatId: chat._id,
      sendBy,
      sendTo,
      content,
      date,
      time,
    });

    // 🟢 4️⃣ تحديث بيانات الشات
    chat.lastMessage = message._id;
    chat.messages.push(message._id);
    await chat.save();

    // 🟢 5️⃣ إرسال الرسالة للطرف الآخر في الوقت الحقيقي
    const io = req.app.get("io");
    const receiver = await UserModel.findById(sendTo).select("socketId isOnline");

    if (receiver?.isOnline && receiver?.socketId) {
      io.to(receiver.socketId).emit("receiveMessage", {
        chatId: chat._id,
        message: message.toObject(),
      });
    } else {
    }

    // 🟢 6️⃣ الرد على المرسل
    res.status(200).json({
      success: true,
      chatId: chat._id,
      message,
    });

  } catch (error) {
    console.error("❌ Error in initChat:", error);
    res.status(500).json({ success: false, message: "Server error" });
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