// server.js

const http = require('http');
const fs = require('fs');
const app = require('./app');
const path = './service-account.json';
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { syncSheetToDatabase } = require('./controllers/sheet.controller');

// 🔐 Handle service account file from base64 env variable
if (!fs.existsSync(path)) {
  const serviceAccountBase64 = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccountBase64) {
    console.error('❌ Missing GOOGLE_SERVICE_ACCOUNT environment variable.');
    process.exit(1);
  }
  try {
    const jsonContent = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
    fs.writeFileSync(path, jsonContent);
    console.log('✅ service-account.json created from base64 string.');
  } catch (err) {
    console.error('❌ Failed to create service-account.json:', err.message);
    process.exit(1);
  }
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 🔁 Cache the last emitted sheet data
let latestData = [];

mongoose.connection.once('open', async () => {
  console.log('✅ MongoDB connection is now open.');

  // 🔄 Initial sync at startup
  latestData = await syncSheetToDatabase(io); // Emits and returns updated data

  io.on('connection', async (socket) => {
    console.log('📡 Client connected via WebSocket:', socket.id);

    try {
      if (latestData.length > 0) {
        console.log(`📤 Sending cached data to client: ${latestData.length} rows`);
        socket.emit('sheetDataUpdated', latestData);
      } else {
        const db = mongoose.connection.db;
        const collection = db.collection('sheetdata');
        const data = await collection.find({}).toArray();
        latestData = data;
        console.log(`📤 Sending DB data to client: ${data.length} rows`);
        socket.emit('sheetDataUpdated', data);
      }
    } catch (error) {
      console.error('❌ Error sending data to client:', error.message);
    }
  });

  // 🔁 Sync every 60s
  setInterval(async () => {
    try {
      const updated = await syncSheetToDatabase(io); // emits if changed
      if (updated.length > 0) {
        latestData = updated;
        console.log(`🔁 Updated and emitted ${updated.length} rows`);
      }
    } catch (err) {
      console.error('❌ Sync error:', err.message);
    }
  }, 60000);

  server.listen(5000, () => {
    console.log('🚀 Server running at http://localhost:5000');
  });
});
