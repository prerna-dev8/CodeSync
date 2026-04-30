import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { signToken } from "../utils/jwt";
import Session from "../models/Session";

describe("Session Management API", () => {
  let token: string;
  let userId: string;
  let secondToken: string;
  let secondUserId: string;

  beforeAll(() => {
    userId = new mongoose.Types.ObjectId().toString();
    token = signToken({ id: userId });

    secondUserId = new mongoose.Types.ObjectId().toString();
    secondToken = signToken({ id: secondUserId });
  });

  afterAll(async () => {
    await Session.deleteMany({});
  });

  beforeEach(async () => {
    await Session.deleteMany({});
  });

  describe("POST /api/session", () => {
    it("should return 401 if no token is provided", async () => {
      const res = await request(app).post("/api/session");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Access token required");
    });

    it("should return 401 if token is invalid", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Authorization", "Bearer invalid_token");
      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Invalid or expired access token");
    });

    it("should create a session with valid JWT", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Session created");
      expect(res.body.sessionId).toBeDefined();
      expect(res.body.sessionId).toHaveLength(10);
      expect(res.body.sessionId).toMatch(/^[0-9a-f]+$/);
    });

    it("should create session with owner role", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(201);
      const session = await Session.findOne({ sessionId: res.body.sessionId });
      expect(session?.users).toHaveLength(1);
      expect(session?.users[0].role).toBe("owner");
    });

    it("should set default state to active", async () => {
      const res = await request(app)
        .post("/api/session")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(201);
      const session = await Session.findOne({ sessionId: res.body.sessionId });
      expect(session?.state).toBe("active");
    });

    it("should generate 10-character hex session ID", async () => {
      const validToken = signToken({ id: new mongoose.Types.ObjectId().toString() });
      const res = await request(app)
        .post("/api/session")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toMatch(/^[0-9a-f]{10}$/);
    });
  });

  describe("GET /api/session/:sessionId", () => {
    let testSessionId: string;

    beforeEach(async () => {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const session = await Session.create({
        sessionId: "deadbeef01",
        users: [{ userId: userObjectId, role: "owner" }],
        state: "active",
      });
      testSessionId = session.sessionId;
    });

    it("should return 401 if no token provided", async () => {
      const res = await request(app).get("/api/session/deadbeef01");
      expect(res.status).toBe(401);
    });

    it("should return 404 if session not found", async () => {
      const res = await request(app)
        .get("/api/session/notexist")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Session not found");
    });

    it("should return 403 if session is archived", async () => {
      await Session.updateOne({ sessionId: testSessionId }, { $set: { state: "archived" } });

      const res = await request(app)
        .get(`/api/session/${testSessionId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Session is archived");
    });

    it("should return session details for active session", async () => {
      const res = await request(app)
        .get(`/api/session/${testSessionId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(testSessionId);
      expect(res.body.state).toBe("active");
      expect(res.body.role).toBe("owner");
    });

    it("should add user as viewer if not a member", async () => {
      const res = await request(app)
        .get(`/api/session/${testSessionId}`)
        .set("Authorization", `Bearer ${secondToken}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("viewer");
    });

    it("should not modify role if user already exists", async () => {
      // Second user already added as viewer
      await request(app)
        .get(`/api/session/${testSessionId}`)
        .set("Authorization", `Bearer ${secondToken}`);

      // Get again - role should remain viewer
      const res = await request(app)
        .get(`/api/session/${testSessionId}`)
        .set("Authorization", `Bearer ${secondToken}`);

      expect(res.status).toBe(200);
      expect(res.body.role).toBe("viewer");
    });
  });

  describe("GET /api/session", () => {
    beforeEach(async () => {
      // Create sessions for user
      const userObjectId = new mongoose.Types.ObjectId(userId);
      await Session.create([
        { sessionId: "1111111111", users: [{ userId: userObjectId, role: "owner" }], state: "active" },
        { sessionId: "2222222222", users: [{ userId: userObjectId, role: "owner" }], state: "active" },
      ]);
    });

    it("should return 401 if no token", async () => {
      const res = await request(app).get("/api/session");
      expect(res.status).toBe(401);
    });

    it("should return all sessions for user", async () => {
      const res = await request(app)
        .get("/api/session")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(2);
    });

    it("should include role in response", async () => {
      const res = await request(app)
        .get("/api/session")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions[0].role).toBe("owner");
    });
  });

  describe("POST /api/session/:sessionId/archive", () => {
    let testSessionId: string;

    beforeEach(async () => {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const session = await Session.create({
        sessionId: "deadbeef01",
        users: [{ userId: userObjectId, role: "owner" }],
        state: "active",
      });
      testSessionId = session.sessionId;
    });

    it("should return 401 if no token", async () => {
      const res = await request(app)
        .post(`/api/session/${testSessionId}/archive`);
      expect(res.status).toBe(401);
    });

    it("should return 403 if user is not owner", async () => {
      const res = await request(app)
        .post(`/api/session/${testSessionId}/archive`)
        .set("Authorization", `Bearer ${secondToken}`);
      expect(res.status).toBe(403);
    });

    it("should archive session as owner", async () => {
      const res = await request(app)
        .post(`/api/session/${testSessionId}/archive`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Session archived");
      expect(res.body.state).toBe("archived");

      // Verify in DB
      const session = await Session.findOne({ sessionId: testSessionId });
      expect(session?.state).toBe("archived");
    });

    it("should return 403 if session not found", async () => {
      const res = await request(app)
        .post("/api/session/notexist/archive")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });
});
