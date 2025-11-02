import jwt from "jsonwebtoken";
import UserModel from "../../models/User.model.js";

export const authMiddleware =async  (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  const token = authHeader.split(" ")[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded);
  const user = await UserModel.findById(decoded.id);
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token is not valid" });
  }
};
