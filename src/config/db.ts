import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer | null = null;

const connectDB = async (): Promise<void> => {
  try {
    let uri = process.env.MONGO_URI as string;

    if (!uri || uri.includes("localhost") || uri.includes("127.0.0.1")) { //replace - if (!uri) {
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log("Using in-memory MongoDB (no local MongoDB found)");
    }

    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", (err as Error).message);
    process.exit(1);
  }
};

export default connectDB;
