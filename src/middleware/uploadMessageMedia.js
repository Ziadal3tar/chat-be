import multer from "multer";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/", "video/", "application/pdf"];
  if (allowedTypes.some((t) => file.mimetype.startsWith(t))) cb(null, true);
  else cb(new Error("Invalid file type"), false);
};

export const uploadMessageMedia = multer({ storage, fileFilter });
