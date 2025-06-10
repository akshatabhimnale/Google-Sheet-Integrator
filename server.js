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
    origin: [
      'http://localhost:3000',
      'https://localhost:3000',
      'http://127.0.0.1:3000',
      'https://127.0.0.1:3000',
      'https://crm-frontend-yourdomain.com' // Replace with your actual frontend domain
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Make socket.io instance available to the app/routes
app.set('io', io);

// 🔁 Cache the last emitted sheet data
let latestData = [];

mongoose.connection.once('open', async () => {
  console.log('✅ MongoDB connection is now open.');

  // 🔄 Initial sync at startup
  latestData = await syncSheetToDatabase(io); // Emits and returns updated data

  io.on('connection', async (socket) => {
    console.log('📡 Client connected via WebSocket:', socket.id);
    console.log('🌐 Client origin:', socket.handshake.headers.origin);
    console.log('🚀 Transport used:', socket.conn.transport.name);

    // Handle transport upgrade
    socket.conn.on('upgrade', () => {
      console.log('⬆️ Upgraded to', socket.conn.transport.name);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error('❌ Socket error for client', socket.id, ':', error.message);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('📡 Client disconnected:', socket.id, 'Reason:', reason);
    });

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
      socket.emit('error', { message: 'Failed to fetch data' });
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
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('❌ Port 5000 is already in use. Please stop other Node.js processes and try again.');
      console.log('💡 Try running: taskkill /f /im node.exe (Windows) or killall node (Mac/Linux)');
      process.exit(1);
    } else {
      console.error('❌ Server error:', err.message);
      process.exit(1);
    }
  });
});
