import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import dns from "dns";
import mongoose from "mongoose";

import UserModel from "../models/User.model.js";
import { Chat } from "../models/chat.model.js";

dns.setServers(["8.8.8.8", "8.8.4.4"]);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../config/.env") });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error("MONGO_URI is required");

const pairKey = (a, b) => [a.toString(), b.toString()].sort().join(":");

async function migrate() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 });

  const users = await UserModel.find({}).select("_id userName userNameNormalized");
  let updatedUsers = 0;

  for (const user of users) {
    const normalized = user.userName?.trim().toLowerCase() || "";
    if (user.userNameNormalized !== normalized) {
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { userNameNormalized: normalized } }
      );
      updatedUsers += 1;
    }
  }

  const chats = await Chat.find({ participants: { $size: 2 } }).select("_id participants participantKey");
  let updatedChats = 0;

  for (const chat of chats) {
    if (chat.participantKey) continue;
    try {
      await Chat.updateOne(
        { _id: chat._id, participantKey: { $exists: false } },
        { $set: { participantKey: pairKey(chat.participants[0], chat.participants[1]) } }
      );
      updatedChats += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  console.log(`User records updated: ${updatedUsers}`);
  console.log(`Chat records updated: ${updatedChats}`);
}

migrate()
  .catch((error) => {
    console.error("Migration error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
