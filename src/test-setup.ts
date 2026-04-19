// Global test setup: Mock env vars, modules
import 'dotenv/config';

jest.mock('nodemailer');
// jest.mock('../config/passport'); // Optional, only if used

import { jest } from '@jest/globals';

jest.mock('nodemailer');


jest.mock('mongoose');



// Mock process.env for tests
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.PORT = '5000';
process.env.CLIENT_URL = 'http://localhost:3000';

console.log('Test setup loaded');

