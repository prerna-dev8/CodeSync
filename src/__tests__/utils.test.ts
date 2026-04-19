import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { signToken, verifyToken } from '../utils/jwt';
import { generateToken, hashToken } from '../utils/crypto';
import jwt from 'jsonwebtoken';

describe('JWT Utils', () => {
  const payload = { id: 'testuser123' };
  let token: string;

  test('signToken creates valid JWT', () => {
    token = signToken(payload);
    expect(token).toBeDefined();
    expect(token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
  });

  test('verifyToken decodes correctly', () => {
    const decoded = verifyToken(token);
    expect(decoded.id).toBe(payload.id);
  });

  test('verifyToken throws on invalid token', () => {
    expect(() => verifyToken('invalid')).toThrow();
  });
});

describe('Crypto Utils', () => {
  test('generateToken produces raw/hashed pair', () => {
    const { raw, hashed } = generateToken();
    expect(raw).toHaveLength(64);
    expect(hashed).toHaveLength(64);
  });

  test('hashToken is deterministic', () => {
    const raw = 'testtokenraw';
    const hashed = hashToken(raw);
    expect(hashToken(raw)).toBe(hashed);
    expect(hashToken('different')).not.toBe(hashed);
  });
});

