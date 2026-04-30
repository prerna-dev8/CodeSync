import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import User from "../models/User";
import "./setup";

const BASE = "/api/auth";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function registerUser(overrides = {}) {
  return request(app)
    .post(`${BASE}/register`)
    .send({
      username: "testuser",
      email: "test@example.com",
      password: "Test@123",
      ...overrides,
    });
}

async function loginUser(overrides = {}) {
  return request(app)
    .post(`${BASE}/login`)
    .send({
      email: "test@example.com",
      password: "Test@123",
      ...overrides,
    });
}

// ── Register ───────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  test("registers a new user and returns 201 + message", async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toMatch(/registration successful/i);
  });

  test("saves user to database", async () => {
    await registerUser();
    const user = await User.findOne({ email: "test@example.com" });
    expect(user).not.toBeNull();
    expect(user?.username).toBe("testuser");
  });

  test("hashes the password — does not store plain text", async () => {
    await registerUser();
    const user = await User.findOne({ email: "test@example.com" });
    expect(user?.password).not.toBe("Test@123");
    expect(user?.password).toMatch(/^\$2[ab]\$/);
  });

  test("rejects duplicate email with 409", async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/email already in use/i);
  });

  test("rejects duplicate username with 409", async () => {
    await registerUser();
    const res = await registerUser({ email: "other@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/username already taken/i);
  });

  test("rejects missing username", async () => {
    const res = await registerUser({ username: "" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("rejects missing email", async () => {
    const res = await registerUser({ email: "" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("rejects missing password", async () => {
    const res = await registerUser({ password: "" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await registerUser();
  });

  test("logs in with correct credentials and returns token + user", async () => {
    const res = await loginUser();
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe("test@example.com");
    expect(res.body.user.username).toBe("testuser");
  });

  test("returned token is a valid JWT", async () => {
    const res = await loginUser();
    const secret = process.env.JWT_SECRET || "secret";
    const decoded = jwt.verify(res.body.token, secret) as { id: string };
    expect(decoded).toHaveProperty("id");
  });

  test("does not return password in user object", async () => {
    const res = await loginUser();
    expect(res.body.user).not.toHaveProperty("password");
  });

  test("rejects wrong password with 401", async () => {
    const res = await loginUser({ password: "WrongPass@1" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test("rejects non-existent email with 401", async () => {
    const res = await loginUser({ email: "nobody@example.com" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid credentials/i);
  });

  test("rejects empty email", async () => {
    const res = await loginUser({ email: "" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("rejects empty password", async () => {
    const res = await loginUser({ password: "" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("rejects unverified user with 403", async () => {
    await User.updateOne({ email: "test@example.com" }, { isVerified: false });
    const res = await loginUser();
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verify your email/i);
  });
});

// ── Forgot Password ────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  beforeEach(async () => {
    await registerUser();
  });

  test("returns 200 + message for a registered email", async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: "test@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message");
  });

  test("returns same message for unknown email (anti-enumeration)", async () => {
    const known = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: "test@example.com" });
    const unknown = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: "ghost@example.com" });
    expect(known.body.message).toBe(unknown.body.message);
  });
});

// ── Reset Password ─────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  test("rejects an invalid token with 400", async () => {
    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .query({ token: "invalid-token-abc" })
      .send({ password: "NewPass@99" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  test("rejects an expired token with 400", async () => {
    await registerUser();
    const user = await User.findOne({ email: "test@example.com" });
    user!.passwordResetToken = "hashedtoken";
    user!.passwordResetTokenExpiry = new Date(Date.now() - 1000);
    await user!.save();

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .query({ token: "sometoken" })
      .send({ password: "NewPass@99" });
    expect(res.status).toBe(400);
  });
});
