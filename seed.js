import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";
import { faker } from "@faker-js/faker";

import UserModel from "./models/User.model.js";
import { Message } from "./models/Message.model.js";
import { Chat } from "./models/chat.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "config/.env") });
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const MONGO_URI = process.env.MONGO_URI;
const SEED_PASSWORD = process.env.SEED_PASSWORD || "123456";
const RESET_DATABASE = process.argv.includes("--reset") || process.env.SEED_RESET === "true";

const USER_COUNT = 50;
const FRIENDS_PER_USER = 10;
const REQUESTS_PER_USER = 3;
const MESSAGES_PER_CHAT = 24;

const PROFILE_IMAGES = [
  "https://randomuser.me/api/portraits/men/1.jpg",
  "https://randomuser.me/api/portraits/women/2.jpg",
  "https://randomuser.me/api/portraits/men/3.jpg",
  "https://randomuser.me/api/portraits/women/4.jpg",
  "https://randomuser.me/api/portraits/men/5.jpg",
  "https://randomuser.me/api/portraits/women/6.jpg",
];

const MESSAGE_IMAGES = [
  "https://picsum.photos/300/300",
  "https://picsum.photos/400/300",
  "https://picsum.photos/500/400",
];

const formatDate = (date) => date.toLocaleDateString("en-GB");
const formatTime = (date) => date.toLocaleTimeString("en-US", { hour12: false });
const pairKey = (a, b) => [a.toString(), b.toString()].sort().join(":");

const messageText = [
  "Hey! How are you?",
  "Are you available today?",
  "I just finished the task.",
  "Can you check this with me?",
  "Looks good to me.",
  "I will send the files shortly.",
  "Let's talk about it later.",
  "Thanks for your help!",
];

const addUnique = (array, id) => {
  if (!array.some((item) => item.toString() === id.toString())) array.push(id);
};

const addPending = (array, key, id) => {
  if (!array.some((item) => item?.[key]?.toString() === id.toString() && item.status === "pending")) {
    array.push({ [key]: id, status: "pending" });
  }
};

const randomPastDate = (days = 30) => {
  const date = new Date();
  date.setDate(date.getDate() - faker.number.int({ min: 0, max: days }));
  date.setHours(faker.number.int({ min: 0, max: 23 }));
  date.setMinutes(faker.number.int({ min: 0, max: 59 }));
  date.setSeconds(faker.number.int({ min: 0, max: 59 }));
  return date;
};

async function clearDatabase() {
  await Promise.all([
    Message.deleteMany({}),
    Chat.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
}

async function createUsers() {
  const users = [];

  for (let index = 0; index < USER_COUNT; index += 1) {
    const fullName = faker.person.fullName();
    users.push(
      await UserModel.create({
        userName: `${fullName} ${index + 1}`,
        email: `seed.user.${index + 1}@example.com`,
        phone: `010${faker.string.numeric(8)}`,
        password: SEED_PASSWORD,
        profileImage: PROFILE_IMAGES[index % PROFILE_IMAGES.length],
        isOnline: faker.datatype.boolean({ probability: 25 }),
      })
    );
  }

  return users;
}

async function createFriends(users) {
  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];

    for (let offset = 1; offset <= FRIENDS_PER_USER / 2; offset += 1) {
      const next = users[(index + offset) % users.length];
      const previous = users[(index - offset + users.length) % users.length];
      addUnique(user.friends, next._id);
      addUnique(user.friends, previous._id);
    }
  }

  await Promise.all(users.map((user) => user.save()));
}

async function createRequests(users) {
  for (let index = 0; index < users.length; index += 1) {
    const sender = users[index];
    let created = 0;

    for (let offset = FRIENDS_PER_USER / 2 + 1; offset < users.length && created < REQUESTS_PER_USER; offset += 1) {
      const target = users[(index + offset) % users.length];
      if (target._id.toString() === sender._id.toString()) continue;
      if (sender.friends.some((id) => id.toString() === target._id.toString())) continue;

      addPending(sender.friendRequestsSent, "to", target._id);
      addPending(target.friendRequests, "from", sender._id);
      created += 1;
    }
  }

  await Promise.all(users.map((user) => user.save()));
}

async function createChats(users) {
  const used = new Set();
  let chatCount = 0;
  let messageCount = 0;

  for (const user of users) {
    const userIndex = users.findIndex((item) => item._id.toString() === user._id.toString());
    let createdForUser = 0;

    for (let offset = 1; offset < users.length && createdForUser < 2; offset += 1) {
      const other = users[(userIndex + offset) % users.length];
      const key = pairKey(user._id, other._id);
      if (used.has(key)) continue;
      if (!user.friends.some((id) => id.toString() === other._id.toString())) continue;

      used.add(key);
      const chat = await Chat.create({
        participants: [user._id, other._id],
        participantKey: key,
      });

      const messages = [];
      for (let index = 0; index < MESSAGES_PER_CHAT; index += 1) {
        const sender = index % 2 === 0 ? user : other;
        const receiver = index % 2 === 0 ? other : user;
        const date = randomPastDate(30);
        const asImage = index > 0 && faker.datatype.boolean({ probability: 0.2 });

        const message = await Message.create({
          chatId: chat._id,
          sendBy: sender._id,
          sendTo: receiver._id,
          content: asImage ? "" : faker.helpers.arrayElement(messageText),
          fileUrl: asImage ? faker.helpers.arrayElement(MESSAGE_IMAGES) : null,
          fileType: asImage ? "image" : null,
          date: formatDate(date),
          time: formatTime(date),
          isRead: faker.datatype.boolean({ probability: 0.7 }),
        });

        messages.push(message._id);
        messageCount += 1;
      }

      const lastMessage = await Message.findById(messages[messages.length - 1]);
      chat.lastMessage = lastMessage?._id || null;
      chat.lastMessageAt = lastMessage?.createdAt || null;
      // New code does not append every message id to Chat.messages.
      await chat.save();

      await Promise.all([
        UserModel.updateOne({ _id: user._id }, { $addToSet: { chats: chat._id } }),
        UserModel.updateOne({ _id: other._id }, { $addToSet: { chats: chat._id } }),
      ]);

      chatCount += 1;
      createdForUser += 1;
    }
  }

  return { chatCount, messageCount };
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

  faker.seed(20260927);
  const users = await createUsers();
  await createFriends(users);
  await createRequests(users);
  const stats = await createChats(users);

  console.log("SEED COMPLETED");
  console.log(`Users: ${users.length}`);
  console.log(`Chats: ${stats.chatCount}`);
  console.log(`Messages: ${stats.messageCount}`);
  console.log(`Password: ${SEED_PASSWORD}`);
}

seed()
  .catch((error) => {
    console.error("SEED ERROR:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
