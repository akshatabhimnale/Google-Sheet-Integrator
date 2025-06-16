require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const sheetRoutes = require('./routes/sheet.routes');
const authRoutes = require('./routes/auth.routes');
const campaignUpdatesRoutes = require('./routes/campaignUpdates.routes');

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

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection failed:', err.message));

// Routes
app.use('/api/sheets', sheetRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignUpdatesRoutes);

module.exports = app;
