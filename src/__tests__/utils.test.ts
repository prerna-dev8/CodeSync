import { describe, expect, test } from '@jest/globals';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { generateToken, hashToken } from '../utils/crypto';

describe('JWT Utils', () => {
  const payload = { id: 'testuser123' };
  let accessToken: string;
  let refreshToken: string;

  test('signAccessToken creates valid JWT', () => {
    accessToken = signAccessToken(payload);
    expect(accessToken).toBeDefined();
    expect(accessToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
  });

  test('verifyAccessToken decodes correctly', () => {
    const decoded = verifyAccessToken(accessToken);
    expect(decoded.id).toBe(payload.id);
  });

  test('verifyAccessToken throws on invalid token', () => {
    expect(() => verifyAccessToken('invalid')).toThrow();
  });

  test('signRefreshToken creates valid refresh token', () => {
    refreshToken = signRefreshToken(payload);
    expect(refreshToken).toBeDefined();
    expect(refreshToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
  });

  test('verifyRefreshToken decodes correctly', () => {
    const decoded = verifyRefreshToken(refreshToken);
    expect(decoded.id).toBe(payload.id);
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

