import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    sendBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sendTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String },
    date: { type: String },
    time: { type: String },
    isRead: { type: Boolean, default: false },
 fileUrl: { type: String },
  fileType: { type: String, enum: ['image', 'video', 'pdf', null], default: null },
  },
  { timestamps: true }
);

export const Message = mongoose.model("Message", messageSchema);
