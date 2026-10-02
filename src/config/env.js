import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const envResult = dotenv.config({
  path: path.join(rootDir, "config/.env"),
});

if (envResult.error && envResult.error.code !== "ENOENT") {
  throw envResult.error;
}

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const nodeEnv = process.env.NODE_ENV || "development";

const rawCorsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production" || process.env.ENV === "PROD",
  port: toNumber(process.env.PORT, 3000),
  mongoUri: process.env.MONGO_URI || "",
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  saltRounds: toNumber(process.env.SALTROUND, 10),
  corsOrigins: rawCorsOrigins,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
  urlEncodedBodyLimit: process.env.URLENCODED_BODY_LIMIT || "1mb",
  apiRateLimit: toNumber(process.env.API_RATE_LIMIT, 300),
  authRateLimit: toNumber(process.env.AUTH_RATE_LIMIT, 10),
  messageRateLimit: toNumber(process.env.MESSAGE_RATE_LIMIT, 60),
  chatReadRateLimit: toNumber(process.env.CHAT_READ_RATE_LIMIT, 120),
  searchRateLimit: toNumber(process.env.SEARCH_RATE_LIMIT, 30),
  friendActionRateLimit: toNumber(process.env.FRIEND_ACTION_RATE_LIMIT, 30),
  maxUploadSizeMb: toNumber(process.env.MAX_UPLOAD_SIZE_MB, 50),
  profileImageMaxSizeMb: toNumber(process.env.PROFILE_IMAGE_MAX_SIZE_MB, 5),
  messageMaxLength: Math.floor(toNumber(process.env.MESSAGE_MAX_LENGTH, 5000)),
  cloudinary: {
    cloudName: process.env.cloud_name || "",
    apiKey: process.env.api_key || "",
    apiSecret: process.env.api_secret || "",
  },
  mail: {
    user: process.env.nodeMailerEmail || "",
    password: process.env.nodeMailerPassword || "",
  },
});

const required = [
  ["MONGO_URI", env.mongoUri],
  ["JWT_SECRET", env.jwtSecret],
];

const missing = required.filter(([, value]) => !value).map(([key]) => key);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

if (env.isProduction && env.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}


export default env;
