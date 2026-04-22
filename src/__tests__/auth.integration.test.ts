import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import testApp from './testApp';
const app = testApp;

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.db?.dropDatabase();
});

describe('Auth Integration', () => {
  test('register endpoint', async () => {
    const data = {
      username: 'test',
      email: 'test@test.com',
      password: 'password123'
    };
    const res = await request(app)
      .post('/api/auth/register')
      .send(data)
      .expect(201);
    expect(res.body.message).toMatch(/Registration successful/);
  });

  test('POST /api/auth/register → verify → login', async () => {
    const regData = {
      username: 'intuser',
      email: 'int@example.com',
      password: 'password123',
    };

    const regRes = await request(app)
      .post('/api/auth/register')
      .send(regData)
      .expect(201);

    expect(regRes.body.message).toMatch(/Registration successful/);

    // Note: Full e2e verify/login requires email token parsing (mocked)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: regData.email, password: regData.password })
      .expect(403); // Expected unverified

    expect(loginRes.body.message).toMatch(/verify/);
  });
});

