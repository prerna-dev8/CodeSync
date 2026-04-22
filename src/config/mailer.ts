import nodemailer from "nodemailer";

let transporter: any;

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  // Mock for tests - no jest in runtime
  transporter = {
    sendMail: () => Promise.resolve({}),
  };
} else {
// Mock compatible with test-setup
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  module.exports = {
    createTransport: () => ({
      sendMail: () => Promise.resolve({})
    })
  };
} else {
  const nodemailer = require('nodemailer');
  module.exports = nodemailer;
}
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER || 'testuser',
      pass: process.env.SMTP_PASS || 'testpass',
    },
  });

}

export default transporter;
