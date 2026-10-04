import { asyncHandler } from "../../services/asyncHandler.js";
import { createStory, deleteStory, listStories, viewStory, toggleStoryReaction } from "./stories.service.js";

export const create = asyncHandler(async (req, res) => {
  const story = await createStory({
    ownerId: req.userId,
    file: req.file,
    caption: req.body?.caption,
  });

  const populated = await story.populate("owner", "userName profileImage bio isOnline");
  return res.status(201).json({ success: true, story: populated });
});

export const list = asyncHandler(async (req, res) => {
  const stories = await listStories(req.userId);
  return res.json({ success: true, stories });
});

export const view = asyncHandler(async (req, res) => {
  const result = await viewStory(req.userId, req.params.id, req.app.get("io"));
  return res.json(result);
});

export const react = asyncHandler(async (req, res) => {
  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim().slice(0, 8) : "";
  if (!emoji) return res.status(400).json({ success: false, message: "Emoji is required" });
  const result = await toggleStoryReaction(req.userId, req.params.id, emoji, req.app.get("io"));
  return res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  await deleteStory(req.userId, req.params.id);
  return res.json({ success: true });
});
