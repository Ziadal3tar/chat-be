import UserModel from "../../../models/User.model.js";
import { Story } from "../../../models/Story.model.js";
import { AppError } from "../../services/AppError.js";
import { deleteCloudinaryAsset, uploadStoryMedia } from "../../services/media.service.js";

const STORY_DURATION_MS = 24 * 60 * 60 * 1000;

const id = (value) => value?.toString();

const getEligibleUserIds = async (userId) => {
  const me = await UserModel.findById(userId).select("friends blockedUsers").lean();
  if (!me) throw new AppError("User not found", 404);

  const candidateIds = [userId, ...(me.friends || [])].map(id);
  const candidates = await UserModel.find({ _id: { $in: candidateIds } })
    .select("_id blockedUsers friends")
    .lean();

  return candidates
    .filter((user) => {
      if (id(user._id) === id(userId)) return true;
      const blockedByMe = (me.blockedUsers || []).some((blocked) => id(blocked) === id(user._id));
      const blocksMe = (user.blockedUsers || []).some((blocked) => id(blocked) === id(userId));
      return !blockedByMe && !blocksMe;
    })
    .map((user) => user._id);
};

export const createStory = async ({ ownerId, file, caption }) => {
  if (!file) throw new AppError("Story media is required", 400);

  const text = typeof caption === "string" ? caption.trim() : "";
  if (text.length > 500) throw new AppError("Story caption cannot exceed 500 characters", 400);

  const media = await uploadStoryMedia(file);
  return Story.create({
    owner: ownerId,
    mediaUrl: media.url,
    mediaPublicId: media.publicId,
    resourceType: media.resourceType,
    mediaType: media.fileType,
    caption: text,
    expiresAt: new Date(Date.now() + STORY_DURATION_MS),
  });
};

export const listStories = async (userId) => {
  const eligibleIds = await getEligibleUserIds(userId);
  const now = new Date();
  const stories = await Story.find({
    owner: { $in: eligibleIds },
    expiresAt: { $gt: now },
  })
    .populate("owner", "userName profileImage bio isOnline")
    .sort({ createdAt: 1 })
    .lean();

  const groups = new Map();
  for (const story of stories) {
    const ownerId = id(story.owner?._id);
    if (!ownerId) continue;
    if (!groups.has(ownerId)) {
      groups.set(ownerId, {
        user: story.owner,
        stories: [],
        hasUnviewed: false,
      });
    }
    const viewed = story.viewers?.some((viewer) => id(viewer) === id(userId));
    groups.get(ownerId).stories.push({
      ...story,
      isViewed: !!viewed,
      viewers: undefined,
    });
    if (!viewed) groups.get(ownerId).hasUnviewed = true;
  }

  return [...groups.values()];
};

export const viewStory = async (userId, storyId) => {
  const eligibleIds = await getEligibleUserIds(userId);
  const story = await Story.findOne({
    _id: storyId,
    owner: { $in: eligibleIds },
    expiresAt: { $gt: new Date() },
  });

  if (!story) throw new AppError("Story not found", 404);
  story.viewers.addToSet(userId);
  await story.save();
  return { success: true };
};

export const deleteStory = async (userId, storyId) => {
  const story = await Story.findOne({ _id: storyId, owner: userId });
  if (!story) throw new AppError("Story not found", 404);
  await Story.deleteOne({ _id: story._id });
  if (story.mediaPublicId) {
    deleteCloudinaryAsset(story.mediaPublicId, story.resourceType).catch(() => {});
  }
  return story;
};

export const purgeExpiredStories = async () => {
  const expired = await Story.find({ expiresAt: { $lte: new Date() } }).select("_id mediaPublicId resourceType").lean();
  if (!expired.length) return 0;
  await Story.deleteMany({ _id: { $in: expired.map((story) => story._id) } });
  await Promise.all(
    expired.filter((story) => story.mediaPublicId).map((story) =>
      deleteCloudinaryAsset(story.mediaPublicId, story.resourceType).catch(() => null)
    )
  );
  return expired.length;
};
