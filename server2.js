require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { getSheetData } = require('./sheetsService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas successfully!');
  })
  .catch((error) => {
    console.error('❌ Failed to connect to MongoDB Atlas:', error.message);
  });

// Dynamic schema
const SheetData = mongoose.model('SheetData', new mongoose.Schema({}, { strict: false }));

// WebSocket setup
io.on('connection', (socket) => {
  console.log('📡 A client connected:', socket.id);

  SheetData.find().then(data => {
    socket.emit('sheetDataUpdated', data);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// In-memory hash to detect changes
let previousSheetHash = '';

// Poll every 60 seconds
setInterval(async () => {
  try {
    const sheetRows = await getSheetData();
    if (!sheetRows.length) return;

    // Step 1: Create hash of entire sheet content
    const sheetString = JSON.stringify(sheetRows);
    const currentHash = crypto.createHash('sha256').update(sheetString).digest('hex');

    // Step 2: Check if sheet has changed
    if (currentHash === previousSheetHash) {
      console.log('⏩ No changes in Google Sheet. Skipping sync.');
      return;
    }

    previousSheetHash = currentHash;

    // Step 3: Wipe and replace DB with exact sheet rows
    await SheetData.deleteMany({});
    await SheetData.insertMany(sheetRows);
    console.log(`✅ Synced ${sheetRows.length} rows from Google Sheet to MongoDB`);

    // Step 4: Emit updated data
    const updatedData = await SheetData.find();
    io.emit('sheetDataUpdated', updatedData);

  } catch (err) {
    console.error('❌ Polling error:', err.message || err);
  }
}, 60000);


// Test endpoint
app.get('/test', (req, res) => {
  res.send('🟢 Backend is running with Socket.IO');
});

server.listen(5000, () => {
  console.log('🚀 Server running on http://localhost:5000 with WebSocket support');
});
