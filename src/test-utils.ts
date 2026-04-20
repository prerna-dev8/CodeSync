import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

export const connectTestDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

export const disconnectTestDB = async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
};

export const dropDB = async () => {
  await mongoose.connection.db?.dropDatabase();
};

export const createTestUser = async () => {
  const user = await require('../models/User').default.create({
    username: 'test',
    email: 'test@example.com',
    password: 'password123',
    isVerified: true,
  });
  return user;
};

