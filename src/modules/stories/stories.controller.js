import { asyncHandler } from "../../services/asyncHandler.js";
import { createStory, deleteStory, listStories, viewStory } from "./stories.service.js";

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
  await viewStory(req.userId, req.params.id);
  return res.json({ success: true });
});

export const remove = asyncHandler(async (req, res) => {
  await deleteStory(req.userId, req.params.id);
  return res.json({ success: true });
});
