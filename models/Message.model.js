import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    sendBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sendTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    isRead: { type: Boolean, default: false, index: true },
    starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    fileUrl: { type: String, default: null },
    filePublicId: { type: String, default: null },
    fileResourceType: { type: String, enum: ["image", "video", "raw", null], default: null },
    fileType: {
      type: String,
      enum: ["image", "video", "audio", "pdf", null],
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ chatId: 1, isDeleted: 1, createdAt: -1, _id: -1 });
messageSchema.index({ sendTo: 1, isRead: 1, isDeleted: 1, chatId: 1 });
messageSchema.index({ starredBy: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);
