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
 * API to get all sheet data for the dashboard
 */
async function getAllSheetData(req, res) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('sheetdata');
    
    const allData = await collection.find({}).toArray();
    
    // Convert Date objects back to strings for frontend compatibility
    const formattedData = allData.map(row => ({
      ...row,
      'Start Date': row['Start Date'] ? row['Start Date'].toISOString().split('T')[0] : null,
      'Deadline': row['Deadline'] ? row['Deadline'].toISOString().split('T')[0] : null,
    }));
    
    console.log(`📊 Returning ${formattedData.length} rows to dashboard`);
    res.json(formattedData);
  } catch (err) {
    console.error('❌ getAllSheetData error:', err.message);
    res.status(500).json({ error: err.message });
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


/**
 * API to return counts for simplified status categories.
 * Maps statuses as follows:
 * - "Completed", "Internally Completed" → "Completed"
 * - "Flagged", "Paused" → "Paused"
 * - "Live" → "Live"
 * - "Not Live", "TBC" → "Not Live"
 */
async function getStatusSummary(req, res) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('sheetdata');
    const allData = await collection.find({}).toArray();

    const statusMap = {
      Completed: ['Completed', 'Internally Completed'],
      Paused: ['Flagged', 'Paused'],
      Live: ['Live'],
      'Not Live': ['Not Live', 'TBC']
    };

    const summary = {
      Completed: 0,
      Paused: 0,
      Live: 0,
      'Not Live': 0
    };

    for (const row of allData) {
      const status = (row.Status || '').trim(); // Ensure fallback if undefined
      for (const [key, values] of Object.entries(statusMap)) {
        if (values.includes(status)) {
          summary[key]++;
          break;
        }
      }
    }

    res.json(summary);
  } catch (err) {
    console.error('❌ getStatusSummary error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Get all updates for a specific campaign
 */
async function getCampaignUpdates(req, res) {
  const { campaignId } = req.params;

  if (!campaignId) {
    return res.status(400).json({ error: 'Campaign ID is required' });
  }

  try {
    const db = mongoose.connection.db;
    const updatesCollection = db.collection('campaignupdates');

    const updates = await updatesCollection
      .find({ campaignId: campaignId })
      .sort({ timestamp: -1 })
      .toArray();

    res.json(updates);
  } catch (err) {
    console.error('❌ getCampaignUpdates error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Add a new update for a campaign
 */
async function addCampaignUpdate(req, res) {
  const { campaignId } = req.params;
  const { message, userId, userName } = req.body;

  if (!campaignId || !message || !userId || !userName) {
    return res.status(400).json({ 
      error: 'Campaign ID, message, user ID, and user name are required' 
    });
  }

  try {
    const db = mongoose.connection.db;
    const updatesCollection = db.collection('campaignupdates');

    const newUpdate = {
      campaignId: campaignId,
      message: message.trim(),
      userId: userId,
      userName: userName,
      timestamp: new Date(),
      _id: new mongoose.Types.ObjectId()
    };

    await updatesCollection.insertOne(newUpdate);

    // Emit the new update to all connected clients for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('campaignUpdateAdded', {
        campaignId: campaignId,
        update: newUpdate
      });
    }

    res.status(201).json({
      success: true,
      update: newUpdate
    });
  } catch (err) {
    console.error('❌ addCampaignUpdate error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  syncSheetToDatabase,
  testConnection,
  filterByDateRange,
  getStatusSummary,
  getCampaignUpdates,
  addCampaignUpdate,
  getAllSheetData
};
