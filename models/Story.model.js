import mongoose from "mongoose";

const storySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    mediaUrl: { type: String, required: true },
    mediaPublicId: { type: String, required: true },
    resourceType: { type: String, enum: ["image", "video"], required: true },
    mediaType: { type: String, enum: ["image", "video"], required: true },
    caption: { type: String, trim: true, maxlength: 500, default: "" },
    viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ owner: 1, createdAt: -1 });

export const Story = mongoose.model("Story", storySchema);
