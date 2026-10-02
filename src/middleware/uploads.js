import multer from "multer";
import env from "../config/env.js";

const memoryStorage = multer.memoryStorage();

const allowedProfileTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const allowedMessageTypes = new Set([
  ...allowedProfileTypes,
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

const createFilter = (allowedTypes, fieldName) => (_req, file, callback) => {
  if (!allowedTypes.has(file.mimetype)) {
    return callback(new multer.MulterError("LIMIT_UNEXPECTED_FILE", fieldName));
  }

  return callback(null, true);
};

export const uploadProfileImage = multer({
  storage: memoryStorage,
  limits: {
    fileSize: env.profileImageMaxSizeMb * 1024 * 1024,
    files: 1,
    fields: 20,
  },
  fileFilter: createFilter(allowedProfileTypes, "profileImage"),
});

export const uploadMessageFile = multer({
  storage: memoryStorage,
  limits: {
    fileSize: env.maxUploadSizeMb * 1024 * 1024,
    files: 1,
    fields: 20,
  },
  fileFilter: createFilter(allowedMessageTypes, "file"),
});


export const uploadStoryFile = multer({
  storage: memoryStorage,
  limits: {
    fileSize: Math.min(env.maxUploadSizeMb * 1024 * 1024, 15 * 1024 * 1024),
    files: 1,
    fields: 5,
  },
  fileFilter: createFilter(
    new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]),
    "file"
  ),
});
