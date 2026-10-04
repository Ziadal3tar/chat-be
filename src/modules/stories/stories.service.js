import UserModel from "../../../models/User.model.js";
import { Story } from "../../../models/Story.model.js";
import { AppError } from "../../services/AppError.js";
import { deleteCloudinaryAsset, uploadStoryMedia } from "../../services/media.service.js";
import { createNotification } from "../notifications/notifications.service.js";

const STORY_DURATION_MS = 24 * 60 * 60 * 1000;

const id = (value) => value?.toString();

const getEligibleUserIds = async (userId) => {
  const me = await UserModel.findById(userId).select("friends blockedUsers").lean();
  if (!me) throw new AppError("User not found", 404);

  const blockedIds = new Set((me.blockedUsers || []).map(id));
  const friendIds = (me.friends || []).filter((friendId) => !blockedIds.has(friendId.toString()));
  const publicUsers = await UserModel.find({
    _id: { $nin: [userId, ...(me.blockedUsers || [])] },
    "privacyPreferences.storyVisibility": "everyone",
    blockedUsers: { $ne: userId },
  }).select("_id").lean();

  return [...new Set([userId.toString(), ...friendIds.map(id), ...publicUsers.map((user) => user._id.toString())])];
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
    .populate("viewerDetails.user", "userName profileImage isOnline")
    .populate("viewers", "userName profileImage isOnline")
    .populate("reactions.user", "userName profileImage isOnline")
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
    const viewed = story.viewers?.some((viewer) => id(viewer?._id || viewer) === id(userId)) ||
      story.viewerDetails?.some((viewer) => id(viewer?.user?._id || viewer?.user) === id(userId));
    const reactionCounts = Array.isArray(story.reactions)
      ? story.reactions.reduce((acc, item) => { if (item?.emoji) acc[item.emoji] = (acc[item.emoji] || 0) + 1; return acc; }, {})
      : {};
    const rawViewerDetails = Array.isArray(story.viewerDetails) && story.viewerDetails.length
      ? story.viewerDetails
      : (story.viewers || []).map((viewer) => ({ user: viewer, viewedAt: null }));
    const viewerDetails = ownerId === id(userId)
      ? rawViewerDetails.map((viewer) => {
          const reaction = (story.reactions || []).find((item) => id(item?.user?._id || item?.user) === id(viewer?.user?._id || viewer?.user));
          return {
            user: viewer.user,
            viewedAt: viewer.viewedAt,
            reaction: reaction?.emoji || null,
          };
        })
      : undefined;

    groups.get(ownerId).stories.push({
      ...story,
      isViewed: !!viewed,
      viewerCount: story.viewerDetails?.length || story.viewers?.length || 0,
      canSeeViewerCount: ownerId === id(userId),
      canSeeViewerDetails: ownerId === id(userId),
      viewerDetails,
      reactionCounts,
      myReaction: Array.isArray(story.reactions) ? story.reactions.find((item) => id(item?.user?._id || item?.user) === id(userId))?.emoji || null : null,
      viewers: undefined,
      reactions: undefined,
    });
    if (!viewed) groups.get(ownerId).hasUnviewed = true;
  }

  return [...groups.values()];
};

export const viewStory = async (userId, storyId, io = null) => {
  const eligibleIds = await getEligibleUserIds(userId);
  const story = await Story.findOne({
    _id: storyId,
    owner: { $in: eligibleIds },
    expiresAt: { $gt: new Date() },
  });

  if (!story) throw new AppError("Story not found", 404);
  const isOwner = id(story.owner) === id(userId);
  const alreadyViewed = story.viewers.some((viewer) => id(viewer?._id || viewer) === id(userId));

  if (!isOwner) {
    story.viewers.addToSet(userId);
    const existingViewer = (story.viewerDetails || []).find((viewer) => id(viewer.user) === id(userId));
    if (existingViewer) existingViewer.viewedAt = new Date();
    else story.viewerDetails.push({ user: userId, viewedAt: new Date() });
  }

  await story.save();
  if (!alreadyViewed && !isOwner) {
    const viewer = await UserModel.findById(userId).select("userName").lean();
    const owner = await UserModel.findById(story.owner).select("notificationPreferences").lean();
    if (owner?.notificationPreferences?.stories !== false) {
      await createNotification({
        io,
        recipient: story.owner,
        actor: userId,
        type: "story_view",
        title: "Your story was viewed",
        message: `${viewer?.userName || "Someone"} viewed your story.`,
        data: { storyId: story._id, viewerId: userId },
      });
    }
  }
  return { success: true, viewerCount: story.viewers.length };
};

export const toggleStoryReaction = async (userId, storyId, emoji, io = null) => {
  const eligibleIds = await getEligibleUserIds(userId);
  const story = await Story.findOne({ _id: storyId, owner: { $in: eligibleIds }, expiresAt: { $gt: new Date() } });
  if (!story) throw new AppError("Story not found", 404);
  const current = (story.reactions || []).find((reaction) => id(reaction.user) === id(userId));
  if (current?.emoji === emoji) story.reactions = story.reactions.filter((reaction) => id(reaction.user) !== id(userId));
  else if (current) current.emoji = emoji;
  else story.reactions.push({ user: userId, emoji });
  await story.save();

  if (id(story.owner) !== id(userId)) {
    const actor = await UserModel.findById(userId).select("userName").lean();
    await createNotification({
      io,
      recipient: story.owner,
      actor: userId,
      type: "story_reaction",
      title: "Story reaction",
      message: `${actor?.userName || "Someone"} reacted to your story.`,
      data: { storyId: story._id, emoji },
    });
  }
  const reactionCounts = (story.reactions || []).reduce((acc, item) => { acc[item.emoji] = (acc[item.emoji] || 0) + 1; return acc; }, {});
  return { success: true, storyId: story._id, reactionCounts, myReaction: (story.reactions || []).find((item) => id(item.user) === id(userId))?.emoji || null };
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
