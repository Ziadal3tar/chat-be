import { AppError } from "./AppError.js";
import env from "../config/env.js";

const uploadBuffer = (buffer, options = {}) => {
  if (!buffer) {
    return Promise.reject(new AppError("Upload buffer is required", 400));
  }

  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    return Promise.reject(new Error("Cloudinary is not configured"));
  }

  if (!options.cloudinary?.uploader?.upload_stream) {
    return Promise.reject(new Error("Cloudinary uploader is unavailable"));
  }

  return new Promise((resolve, reject) => {
    const stream = options.cloudinary.uploader.upload_stream(
      options.uploadOptions,
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );

    stream.end(buffer);
  });
};

export default uploadBuffer;
