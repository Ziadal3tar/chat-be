// middleware/upload.js
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../services/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "lms_uploads",
    allowed_formats: ["jpg", "png", "jpeg", "mp4", "pdf"],
  },
});

const upload = multer({ storage });

export default upload;
