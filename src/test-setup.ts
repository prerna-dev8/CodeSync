// @ts-nocheck
import 'dotenv/config';

// Mock bcrypt for User model
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashedpw'),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn(),
}));

// Mock env vars
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.CLIENT_URL = 'http://localhost:3000';

console.log('Test setup loaded');

