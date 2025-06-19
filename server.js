// server.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const sheetRoutes = require('./routes/sheet.routes');
const { syncSheetToDatabase } = require('./controllers/sheet.controller');
const authRoutes = require('./routes/auth.routes');
const leadRoutes = require('./routes/lead.routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sheet', sheetRoutes);
app.use('/api/leads', leadRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// MongoDB connection options
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  family: 4,
  maxPoolSize: 10,
  minPoolSize: 5,
  retryWrites: true,
  retryReads: true
};

// MongoDB connection with retry logic
const connectWithRetry = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brianrolf:1lAP1iFaIU8AcHK4@interlink.pdcubpd.mongodb.net/?retryWrites=true&w=majority&appName=Interlink';
  
  try {
    await mongoose.connect(MONGODB_URI, mongooseOptions);
    console.log('✅ Connected to MongoDB Atlas');
    
    try {
      const result = await syncSheetToDatabase(io);
      console.log('✅ Initial data sync completed:', result.message);
    } catch (error) {
      console.error('❌ Error during initial data sync:', error);
    }
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    console.log('🔄 Retrying connection in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

// Start server only after MongoDB connection is established
const startServer = async () => {
  try {
    await connectWithRetry();
    
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });

    // Initial sync on server start
    await syncSheetToDatabase(io);

    // Poll every 5 seconds for live sync
    setInterval(() => {
      syncSheetToDatabase(io).catch(err => console.error('Live sync error:', err));
    }, 5000);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle MongoDB connection errors
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected. Attempting to reconnect...');
  connectWithRetry();
});

// Start the server
startServer();
