import { describe, expect, test, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { protect } from '../middleware/auth';
import { requireVerified } from '../middleware/requireVerified';
import User from '../models/User';
import { signToken } from '../utils/jwt';
import type { AuthRequest } from '../types';

const app = express();
app.use(express.json());

describe('Auth Middleware', () => {
  beforeEach(async () => {
    jest.setTimeout(30000);
    await new Promise(r => setTimeout(r, 1000)); // Wait DB
    await User.deleteMany({});
  }, 30000);

  describe('protect', () => {
    test('attaches user to req with valid token', async () => {
      const testUser = await User.create({
        username: 'test',
        email: 'test@example.com',
        password: 'password123',
        isVerified: true,
      });
      const token = signToken({ id: testUser._id.toString() });

      let reqUser: any;
      app.get('/test', protect as express.RequestHandler, (req: Request, res: Response, next: NextFunction) => {
        reqUser = (req as AuthRequest).user;
        res.json({});
      });

      await request(app).get('/test').set('Authorization', `Bearer ${token}`).expect(200);
      expect((reqUser as any)._id.toString()).toBe(testUser._id.toString());
    });

    test('rejects missing token', async () => {
      app.get('/test', protect as express.RequestHandler, (req: Request, res: Response) => res.json({}));
      await request(app).get('/test').expect(401).expect({ message: 'No token provided' });
    });

    test('rejects invalid token', async () => {
      app.get('/test', protect as express.RequestHandler, (req: Request, res: Response) => res.json({}));
      await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401)
        .expect({ message: 'Invalid or expired token' });
    });
  });

describe('requireVerified', () => {
    test('allows verified user', async () => {
      const user = await User.create({ username: 'v', email: 'v@test.com', password: 'pw', isVerified: true });
      let passed = false;
      const testApp = express();
      testApp.use((req: any, res: Response, next: NextFunction) => { req.user = user; next(); });
      testApp.use(requireVerified as express.RequestHandler);
      testApp.get('/test', (req: Request, res: Response) => { passed = true; res.json({}); });

      await request(testApp).get('/test').expect(200);
      expect(passed).toBe(true);
    });

    test('blocks unverified user', async () => {
      const user = { isVerified: false } as any;
      const testApp = express();
      testApp.use((req: any, res: Response, next: NextFunction) => { req.user = user; next(); });
      testApp.use(requireVerified as express.RequestHandler);
      testApp.get('/test', (req: Request, res: Response) => res.json({}));

      await request(testApp).get('/test').expect(403).expect({ message: 'Please verify your email address to access this resource.' });
    });
  });
});

