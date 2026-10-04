import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import { faker } from "@faker-js/faker";

import UserModel from "./models/User.model.js";
import { Message } from "./models/Message.model.js";
import { Chat } from "./models/chat.model.js";
import { Story } from "./models/Story.model.js";
import { Notification } from "./models/Notification.model.js";
import { Plan } from "./models/Plan.model.js";
import { Session } from "./models/Session.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "config/.env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MONGO_URI = process.env.MONGO_URI;
const SEED_PASSWORD = process.env.SEED_PASSWORD || "123456";
const RESET_DATABASE = process.argv.includes("--reset") || process.env.SEED_RESET === "true";

const SEED_VERSION = "20261004-professional-chat-v2";
const TOTAL_USERS = 24;
const DEMO_CHAT_COUNT = 7;
const GENERAL_CHAT_COUNT = 2;

const DEMO_USERS = [
  { userName: "Ziad Almorsy", email: "demo@chatapp.dev", phone: "01000000001", bio: "Full-Stack Developer building real-time web experiences.", profileImage: "https://randomuser.me/api/portraits/men/32.jpg" },
  { userName: "Ahmed Hassan", email: "ahmed.hassan@chatapp.dev", phone: "01000000002", bio: "Frontend Engineer · Angular · UI Systems", profileImage: "https://randomuser.me/api/portraits/men/44.jpg" },
  { userName: "Sara Mohamed", email: "sara.mohamed@chatapp.dev", phone: "01000000003", bio: "Product Designer who loves clean interactions.", profileImage: "https://randomuser.me/api/portraits/women/44.jpg" },
  { userName: "Omar Khaled", email: "omar.khaled@chatapp.dev", phone: "01000000004", bio: "Backend developer · Node.js · MongoDB", profileImage: "https://randomuser.me/api/portraits/men/46.jpg" },
  { userName: "Mariam Adel", email: "mariam.adel@chatapp.dev", phone: "01000000005", bio: "QA Engineer · Automation · UX details", profileImage: "https://randomuser.me/api/portraits/women/49.jpg" },
  { userName: "Youssef Ali", email: "youssef.ali@chatapp.dev", phone: "01000000006", bio: "Mobile developer and tech enthusiast.", profileImage: "https://randomuser.me/api/portraits/men/52.jpg" },
  { userName: "Nour Ahmed", email: "nour.ahmed@chatapp.dev", phone: "01000000007", bio: "Digital marketer · Content · Growth", profileImage: "https://randomuser.me/api/portraits/women/65.jpg" },
  { userName: "Karim Samir", email: "karim.samir@chatapp.dev", phone: "01000000008", bio: "DevOps · CI/CD · Cloud", profileImage: "https://randomuser.me/api/portraits/men/68.jpg" },
];

const PROFILE_IMAGES = [
  "https://randomuser.me/api/portraits/men/10.jpg",
  "https://randomuser.me/api/portraits/women/11.jpg",
  "https://randomuser.me/api/portraits/men/12.jpg",
  "https://randomuser.me/api/portraits/women/13.jpg",
  "https://randomuser.me/api/portraits/men/14.jpg",
  "https://randomuser.me/api/portraits/women/15.jpg",
  "https://randomuser.me/api/portraits/men/16.jpg",
  "https://randomuser.me/api/portraits/women/17.jpg",
];

const MESSAGE_IMAGES = [
  "https://picsum.photos/seed/chat-design/700/500",
  "https://picsum.photos/seed/chat-office/700/500",
  "https://picsum.photos/seed/chat-coffee/700/500",
  "https://picsum.photos/seed/chat-travel/700/500",
];

const STORY_IMAGES = [
  "https://picsum.photos/seed/story-sunset/900/1500",
  "https://picsum.photos/seed/story-coffee/900/1500",
  "https://picsum.photos/seed/story-workspace/900/1500",
  "https://picsum.photos/seed/story-city/900/1500",
];

const TEXTS = [
  "Hey! How are you doing?",
  "Are you free for a quick call today?",
  "I pushed the latest changes. Can you take a look?",
  "The new design feels much cleaner now.",
  "Let's review the API flow together.",
  "I'll send the files in a minute.",
  "The deployment is live. Everything looks good.",
  "Can you remind me about the meeting tomorrow?",
  "That sounds great. Let's do it.",
  "Thanks! I really appreciate your help.",
  "I found the issue and fixed it.",
  "Let's keep the current version for the demo.",
];

const pairKey = (a, b) => [a.toString(), b.toString()].sort().join(":");
const isoPast = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
const isoFuture = (minutes) => new Date(Date.now() + minutes * 60 * 1000);
const formatDate = (date) => date.toLocaleDateString("en-GB");
const formatTime = (date) => date.toLocaleTimeString("en-US", { hour12: false });
const addUnique = (array, id) => {
  if (!array.some((item) => item.toString() === id.toString())) array.push(id);
};

async function clearDatabase() {
  await Promise.all([
    Message.deleteMany({}),
    Chat.deleteMany({}),
    UserModel.deleteMany({}),
    Story.deleteMany({}),
    Notification.deleteMany({}),
    Plan.deleteMany({}),
    Session.deleteMany({}),
  ]);
}

async function createUsers() {
  const users = [];

  for (let i = 0; i < DEMO_USERS.length; i += 1) {
    const data = DEMO_USERS[i];
    users.push(await UserModel.create({
      ...data,
      password: SEED_PASSWORD,
      isOnline: i === 1 || i === 3,
      lastSeenAt: i === 1 || i === 3 ? null : isoPast(10 + i * 7),
      chatPreferences: {
        chatBackground: ["aurora", "ocean", "emerald", "midnight"][i % 4],
        enterToSend: true,
        notificationsEnabled: true,
        mediaAutoDownload: i % 3 !== 0,
      },
      privacyPreferences: {
        lastSeenVisibility: i === 0 ? "friends" : "everyone",
        onlineStatusVisibility: i === 0 ? "friends" : "everyone",
        readReceipts: i !== 4,
        storyVisibility: i === 6 ? "everyone" : "friends",
      },
      notificationPreferences: {
        messages: true,
        friendRequests: true,
        stories: true,
        calls: true,
        scheduledMessages: true,
      },
    }));
  }

  for (let i = users.length; i < TOTAL_USERS; i += 1) {
    const fullName = faker.person.fullName();
    users.push(await UserModel.create({
      userName: `${fullName.split(" ")[0]} ${i + 1}`,
      email: `user${i + 1}@chatapp.dev`,
      phone: `011${String(10000000 + i).slice(-8)}`,
      password: SEED_PASSWORD,
      bio: faker.helpers.arrayElement([
        "Coffee, code and good conversations.",
        "Always learning something new.",
        "Building products people enjoy using.",
        "Available for a quick chat.",
      ]),
      profileImage: PROFILE_IMAGES[i % PROFILE_IMAGES.length],
      isOnline: faker.datatype.boolean({ probability: 30 }),
      lastSeenAt: isoPast(faker.number.int({ min: 3, max: 400 })),
    }));
  }

  return users;
}

async function createFriends(users) {
  for (let i = 0; i < users.length; i += 1) {
    const user = users[i];
    const desired = Math.min(users.length - 1, i === 0 ? 11 : 7);

    for (let offset = 1; user.friends.length < desired && offset < users.length; offset += 1) {
      const target = users[(i + offset) % users.length];
      addUnique(user.friends, target._id);
      addUnique(target.friends, user._id);
    }
  }
  await Promise.all(users.map((user) => user.save()));
}

async function createRequests(users) {
  const sender = users[1];
  const targets = [users[0], users[10], users[12], users[15]];
  sender.friendRequestsSent = targets.map((target) => ({ to: target._id, status: "pending" }));
  targets.forEach((target) => target.friendRequests.push({ from: sender._id, to: target._id, status: "pending" }));
  await Promise.all([sender.save(), ...targets.map((target) => target.save())]);
}

async function createMessage({ chat, sender, receiver, content, minutesAgo, fileType = null, fileUrl = null, replyTo = null, starredBy = [], pinnedBy = [], reactions = [], isRead = true }) {
  const date = isoPast(minutesAgo);
  return Message.create({
    chatId: chat._id,
    sendBy: sender._id,
    sendTo: receiver._id,
    content: content || "",
    date: formatDate(date),
    time: formatTime(date),
    isRead,
    fileType,
    fileUrl,
    filePublicId: fileType ? `seed/${chat._id}/${Date.now()}` : null,
    fileResourceType: fileType === "pdf" ? "raw" : (fileType ? (fileType === "audio" ? "video" : fileType) : null),
    replyTo,
    starredBy,
    pinnedBy,
    reactions,
  });
}

async function createChat(user, other, messageCount = 18) {
  const participantKey = pairKey(user._id, other._id);
  const chat = await Chat.create({
    participants: [user._id, other._id],
    participantKey,
  });

  const messages = [];
  let previous = null;

  for (let index = 0; index < messageCount; index += 1) {
    const sender = index % 2 === 0 ? user : other;
    const receiver = index % 2 === 0 ? other : user;
    const withImage = index === 4 || index === 11;
    const reply = index === 9 ? previous?._id : null;
    const reactions = index === 6
      ? [{ user: other._id, emoji: "❤️" }, { user: user._id, emoji: "🔥" }]
      : index === 14
        ? [{ user: other._id, emoji: "😂" }]
        : [];
    const starredBy = index === 3 || index === 10 ? [user._id] : index === 7 ? [other._id] : [];
    const pinnedBy = index === 2 || index === 12 ? [user._id] : [];

    const message = await createMessage({
      chat,
      sender,
      receiver,
      content: withImage ? "" : faker.helpers.arrayElement(TEXTS),
      minutesAgo: messageCount * 90 - index * 40,
      fileType: withImage ? "image" : null,
      fileUrl: withImage ? MESSAGE_IMAGES[(index / 4) % MESSAGE_IMAGES.length] : null,
      replyTo: reply,
      starredBy,
      pinnedBy,
      reactions,
      isRead: index !== messageCount - 1 || sender._id.toString() !== user._id.toString(),
    });

    messages.push(message);
    previous = message;
  }

  const lastMessage = messages[messages.length - 1];
  chat.lastMessage = lastMessage._id;
  chat.lastMessageAt = lastMessage.createdAt;
  await chat.save();

  await Promise.all([
    UserModel.updateOne({ _id: user._id }, { $addToSet: { chats: chat._id } }),
    UserModel.updateOne({ _id: other._id }, { $addToSet: { chats: chat._id } }),
  ]);

  return { chat, messages };
}

async function createChats(users) {
  const demoUser = users[0];
  const demoTargets = users.slice(1, 1 + DEMO_CHAT_COUNT);
  const generalTargets = users.slice(1 + DEMO_CHAT_COUNT, 1 + DEMO_CHAT_COUNT + GENERAL_CHAT_COUNT);
  const result = [];

  for (const target of demoTargets) result.push(await createChat(demoUser, target, 26));
  for (const target of generalTargets) result.push(await createChat(target, users[10], 14));

  if (result[0]?.chat) {
    result[0].chat.pinnedBy.addToSet(demoUser._id);
    await result[0].chat.save();
  }
  if (result[1]?.chat) {
    result[1].chat.mutedBy.addToSet(demoUser._id);
    await result[1].chat.save();
  }

  return result;
}

async function createStories(users) {
  const owners = users.slice(0, 6);
  const now = Date.now();
  const stories = [];

  for (let i = 0; i < owners.length; i += 1) {
    const owner = owners[i];
    const viewers = users.slice(1, Math.min(users.length, 8)).filter((u) => u._id.toString() !== owner._id.toString());
    const story = await Story.create({
      owner: owner._id,
      mediaUrl: STORY_IMAGES[i % STORY_IMAGES.length],
      mediaPublicId: `seed/story-${i + 1}`,
      resourceType: "image",
      mediaType: "image",
      caption: faker.helpers.arrayElement([
        "A quiet moment between builds.",
        "Working on something new.",
        "Coffee break.",
        "A little update from today.",
      ]),
      viewers: viewers.slice(0, i % 4 === 0 ? 4 : 2).map((viewer) => viewer._id),
      viewerDetails: viewers.slice(0, i % 4 === 0 ? 4 : 2).map((viewer, index) => ({
        user: viewer._id,
        viewedAt: new Date(now - (index + 1) * 45 * 60 * 1000),
      })),
      reactions: viewers.slice(0, 2).map((viewer, index) => ({
        user: viewer._id,
        emoji: index === 0 ? "❤️" : "🔥",
      })),
      expiresAt: new Date(now + 18 * 60 * 60 * 1000),
    });

    stories.push(story);

    if (i === 0) {
      await Story.updateOne({ _id: story._id }, {
        $push: { viewerDetails: { user: users[8]._id, viewedAt: new Date(now - 10 * 60 * 1000) }, viewers: users[8]._id },
      });
    }
  }

  return stories;
}

async function createNotifications(users, chats, stories) {
  const [demo, ahmed, sara, omar] = users;
  const demoChatId = chats[0]?.chat?._id || null;
  const demoStoryId = stories[0]?._id || null;

  const rows = [
    { recipient: demo, actor: ahmed, type: "message", title: "New message", message: "Ahmed sent you a message.", data: { chatId: demoChatId } },
    { recipient: demo, actor: sara, type: "story_view", title: "Your story was viewed", message: "Sara viewed your story.", data: { storyId: demoStoryId, viewerId: sara._id } },
    { recipient: demo, actor: omar, type: "story_reaction", title: "Story reaction", message: "Omar reacted ❤️ to your story.", data: { storyId: demoStoryId, emoji: "❤️" } },
    { recipient: demo, actor: ahmed, type: "plan_reminder", title: "Time to reply", message: "You planned to reply to Ahmed.", data: { targetUserId: ahmed._id } },
    { recipient: demo, actor: ahmed, type: "scheduled_message_sent", title: "Scheduled message sent", message: "Your scheduled message was sent to Ahmed.", data: { targetUserId: ahmed._id } },
    { recipient: demo, actor: ahmed, type: "friend_request", title: "New friend request", message: "Ahmed wants to connect with you.", data: { userId: ahmed._id } },
    { recipient: demo, actor: omar, type: "call_incoming", title: "Incoming voice call", message: "Omar tried to call you.", data: { userId: omar._id, callType: "audio" } },
  ];

  await Notification.insertMany(rows.map((row, index) => ({
    ...row,
    isRead: index > 2,
    createdAt: isoPast(5 + index * 20),
    updatedAt: isoPast(5 + index * 20),
  })));
}

async function createPlans(users, chats) {
  const demo = users[0];
  const ahmed = users[1];
  const sara = users[2];
  const omar = users[3];
  const demoChat = chats[0]?.chat?._id || null;

  await Plan.insertMany([
    { owner: demo._id, target: ahmed._id, action: "reply_reminder", content: "Remember to review the deployment.", scheduledAt: isoFuture(120), status: "pending", chatId: demoChat },
    { owner: demo._id, target: sara._id, action: "send_reminder", content: "Send the new design notes.", scheduledAt: isoFuture(360), status: "pending", chatId: chats[1]?.chat?._id || null },
    { owner: demo._id, target: omar._id, action: "scheduled_message", content: "The backend changes are ready for review.", scheduledAt: isoPast(90), status: "completed", executedAt: isoPast(85), chatId: chats[2]?.chat?._id || null },
  ]);
}

async function createSessions(users) {
  const demo = users[0];
  await Session.insertMany([
    {
      user: demo._id,
      tokenId: "seed-demo-current-session",
      userAgent: "Chrome · Windows",
      ipAddress: "197.0.0.10",
      createdAt: isoPast(72 * 60),
      lastSeenAt: new Date(),
      expiresAt: isoFuture(60 * 24 * 60),
    },
    {
      user: demo._id,
      tokenId: "seed-demo-mobile-session",
      userAgent: "Chrome · Android",
      ipAddress: "197.0.0.11",
      createdAt: isoPast(240),
      lastSeenAt: isoPast(30),
      expiresAt: isoFuture(30 * 24 * 60),
    },
  ]);
}

async function seed() {
  if (!MONGO_URI) throw new Error("MONGO_URI is required");

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    retryWrites: true,
  });

  if (RESET_DATABASE) {
    await clearDatabase();
  } else if (await UserModel.exists({})) {
    throw new Error("Database already contains users. Use `node seed.js --reset` intentionally.");
  }

  faker.seed(20261004);
  const users = await createUsers();
  await createFriends(users);
  await createRequests(users);
  const chats = await createChats(users);
  const stories = await createStories(users);
  await createNotifications(users, chats, stories);
  await createPlans(users, chats);
  await createSessions(users);

  console.log("SEED COMPLETED");
  console.log(`Seed version: ${SEED_VERSION}`);
  console.log(`Users: ${users.length}`);
  console.log(`Chats: ${chats.length}`);
  console.log(`Password: ${SEED_PASSWORD}`);
  console.log("Demo login: demo@chatapp.dev");
}

seed()
  .catch((error) => {
    console.error("SEED ERROR:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
