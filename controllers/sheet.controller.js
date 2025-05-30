const { getSheetData } = require('../services/sheet.service');
const crypto = require('crypto');
const mongoose = require('mongoose');

let previousSheetHash = '';

/**
 * Syncs Google Sheet data to MongoDB and returns the new data.
 * If `io` is provided, emits 'sheetDataUpdated' only on changes.
 */
async function syncSheetToDatabase(io = null) {
  try {
    const sheetRows = await getSheetData();
    if (!sheetRows.length) {
      console.warn('⚠️ Sheet has no data or fetch failed.');
      return [];
    }

    // Convert Start Date and Deadline to actual Date objects for MongoDB filtering
    const parsedRows = sheetRows.map(row => ({
      ...row,
      'Start Date': row['Start Date'] ? new Date(row['Start Date']) : null,
      'Deadline': row['Deadline'] ? new Date(row['Deadline']) : null,
    }));

    const sheetString = JSON.stringify(parsedRows);
    const currentHash = crypto.createHash('sha256').update(sheetString).digest('hex');

    const db = mongoose.connection.db;
    const collection = db.collection('sheetdata');

    // If sheet has changed, sync and emit
    if (currentHash !== previousSheetHash) {
      previousSheetHash = currentHash;

      await collection.deleteMany({});
      await collection.insertMany(parsedRows);
      console.log(`✅ Synced ${parsedRows.length} rows to MongoDB`);

      if (io) {
        io.emit('sheetDataUpdated', parsedRows);
        console.log('📤 Emitted updated sheet data to all clients');
      }

      return parsedRows;
    }

    // Otherwise, load existing data from DB
    const cachedData = await collection.find({}).toArray();
    console.log(`↪️ No new changes. Using cached DB data (${cachedData.length} rows)`);
    return cachedData;

  } catch (error) {
    console.error('❌ syncSheetToDatabase error:', error.message || error);
    return [];
  }
}

/**
 * API to confirm backend is running.
 */
function testConnection(req, res) {
  res.send('🟢 Backend is running with Socket.IO');
}

/**
 * API to return filtered data by start and end date (expects ISO date strings)
 */
async function filterByDateRange(req, res) {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'Start and end dates are required.' });
  }

  try {
    const db = mongoose.connection.db;
    const collection = db.collection('sheetdata');

    const startDate = new Date(start);
    const endDate = new Date(end);

    const results = await collection.find({
      'Start Date': {
        $gte: startDate,
        $lte: endDate,
      }
    }).toArray();

    res.json(results);
  } catch (err) {
    console.error('❌ filterByDateRange error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  syncSheetToDatabase,
  testConnection,
  filterByDateRange
};
