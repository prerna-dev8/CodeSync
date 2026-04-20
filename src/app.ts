import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import errorHandler from './middleware/errorHandler';

// Import all routes, middleware, controllers...
export { app } from './server';
export { protect } from './middleware/auth';
export { requireVerified } from './middleware/requireVerified';

// Re-export key types
export type { AuthRequest } from './types';

// Export app for Supertest



