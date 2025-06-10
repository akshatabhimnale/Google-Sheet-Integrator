require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sheetRoutes = require('./routes/sheet.routes');

const app = express();

// CORS for Express routes (important for REST APIs)
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://localhost:3000',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:3000',
    'https://crm-frontend-yourdomain.com' // Replace with your actual frontend domain
  ],
  credentials: true
}));

app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection failed:', err.message));

app.use('/api/sheets', sheetRoutes);

module.exports = app;
