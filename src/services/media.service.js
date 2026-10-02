import cloudinary from "./cloudinary.js";
import uploadBuffer from "./cloudinaryUpload.js";
import { AppError } from "./AppError.js";

const profileFormats = new Set(["image/jpeg", "image/png", "image/webp"]);
const messageFormats = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
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

const getFileType = (mime) => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  return null;
};

export const assertProfileFile = (file) => {
  if (!file || !profileFormats.has(file.mimetype)) {
    throw new AppError("Only JPEG, PNG, and WebP images are allowed", 400);
  }
};

export const assertMessageFile = (file) => {
  if (!file || !messageFormats.has(file.mimetype)) {
    throw new AppError(
      "Only images, videos, audio files, and PDF files are allowed",
      400
    );
  }
};

export const uploadProfileImage = async (file) => {
  assertProfileFile(file);

  const result = await uploadBuffer(file.buffer, {
    cloudinary,
    uploadOptions: {
      folder: "usersImages",
      resource_type: "image",
    },
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

export const uploadMessageMedia = async (file) => {
  assertMessageFile(file);
  const fileType = getFileType(file.mimetype);

  const resourceType = fileType === "video" || fileType === "audio" ? "video" : fileType === "pdf" ? "raw" : "image";
  const result = await uploadBuffer(file.buffer, {
    cloudinary,
    uploadOptions: {
      folder: "chat-media",
      resource_type: resourceType,
    },
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType,
    fileType,
  };
};

export const deleteCloudinaryAsset = async (publicId, resourceType = "image") => {
  if (!publicId) return null;

  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    invalidate: true,
  });
};


const storyFormats = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export const uploadStoryMedia = async (file) => {
  if (!file || !storyFormats.has(file.mimetype)) {
    throw new AppError("Only image and video stories are allowed", 400);
  }

  const fileType = file.mimetype.startsWith("video/") ? "video" : "image";
  const result = await uploadBuffer(file.buffer, {
    cloudinary,
    uploadOptions: {
      folder: "chat-stories",
      resource_type: fileType === "video" ? "video" : "image",
    },
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    resourceType: fileType === "video" ? "video" : "image",
    fileType,
  };
};
