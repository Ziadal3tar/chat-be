
import mongoose from "mongoose";
import dns from "dns";

dns.setServers([
    "8.8.8.8",
    "8.8.4.4"
]);
const connection = () => {
  mongoose.set("bufferCommands", false);

  return mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
  });
};

export default connection;
