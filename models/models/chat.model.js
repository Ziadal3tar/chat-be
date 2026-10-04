import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    participantKey: {
      type: String,
      unique: true,
      sparse: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    // Legacy compatibility only. New code reads Message by chatId.
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    messages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1, lastMessageAt: -1 });
chatSchema.index({ participantKey: 1 }, { unique: true, sparse: true });

export const Chat = mongoose.model("Chat", chatSchema);
