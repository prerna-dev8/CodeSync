import express from 'express';
import cors from 'cors';
import * as authController from '../controllers/authController';
import connectDB from '../config/db';

const testApp = express();
testApp.use(cors());
testApp.use(express.json());

testApp.post('/api/auth/register', authController.register);
testApp.post('/api/auth/login', authController.login);
// Add other routes as needed

export default testApp;

