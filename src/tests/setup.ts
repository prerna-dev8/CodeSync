import "dotenv/config";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// Import Session model to register it with Mongoose
import "../models/Session";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
