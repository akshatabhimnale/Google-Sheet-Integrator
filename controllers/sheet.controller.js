const { getSheetData } = require('../services/sheet.service');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');

// Set up in-memory file upload
const upload = multer({ storage: multer.memoryStorage() });

let previousSheetHash = '';

/**
 * Syncs Google Sheet data to MongoDB and returns the new data.
 * If `io` is provided, emits 'sheetDataUpdated' only on changes.
 */
async function uploadExcelToLeadReport(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const allData = [];

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      jsonData.forEach(row => {
        const rawITL = row[Object.keys(row)[6]]; // Column G (7th column, 0-based index 6)
        const updatedTimestampRaw = row[Object.keys(row)[1]]; // Column B (2nd column, 0-based index 1)
        const status = row['Status'] || row['status'] || "";
        const email = row['Email'] || row['email'] || row['Email ID'] || row['email id'] || "";

        if (rawITL) {
          const match = rawITL.match(/ITL\s*-*\s*(\d{4})/i);
          if (match) {
            const itlCode = match[1];

            let dateOnly = null;
            if (updatedTimestampRaw) {
              const date = new Date(updatedTimestampRaw);
              if (!isNaN(date)) {
                dateOnly = date.toISOString().split('T')[0];
              }
            }

            allData.push({
              itlCode,
              date: dateOnly,
              status,
              email
            });
          }
        }
      });
    });

    // Aggregate delivered leads count for each ITL Code
    const leadsMap = {};

    allData.forEach(item => {
      if (item.itlCode) {
        if (!leadsMap[item.itlCode]) {
          leadsMap[item.itlCode] = { deliveredCount: 0, dates: [], status: [], emails: [] };
        }
        leadsMap[item.itlCode].deliveredCount += 1;

        if (item.date) leadsMap[item.itlCode].dates.push(item.date);
        if (item.status) leadsMap[item.itlCode].status.push(item.status);
        if (item.email) leadsMap[item.itlCode].emails.push(item.email);
      }
    });

    const finalData = Object.entries(leadsMap).map(([itlCode, data]) => {
      return {
        itlCode,
        deliveredCount: data.deliveredCount,
        dates: [...new Set(data.dates)], // unique dates
        statusList: [...new Set(data.status)], // unique statuses
        emailList: [...new Set(data.emails)], // unique emails
        insertedAt: new Date()
      };
    });

    const db = mongoose.connection.db;
    const collection = db.collection('leadreportdata');

    if (finalData.length > 0) {
      await collection.insertMany(finalData);
    }

    res.status(200).json({
      message: 'Excel uploaded and lead delivery data stored',
      rowsInserted: finalData.length
    });

  } catch (error) {
    console.error('❌ uploadExcelToLeadReport error:', error.message);
    res.status(500).json({ error: error.message });
  }
}



async function syncSheetToDatabase(io = null) {
  try {
    const sheetRows = await getSheetData();
    if (!sheetRows.length) {
      console.warn('⚠️ Sheet has no data or fetch failed.');
      return [];
    }

    // Filter out rows without ITL code and handle merged rows
    const validRows = sheetRows.filter(row => {
      const itlCode = row['ITL'] || row['Campaign Name']?.match(/ITL[\s-]*\s?(\d+)/i)?.[1];
      return itlCode && itlCode.toString().trim() !== '';
    });

    console.log(`📊 Filtered ${validRows.length} valid rows with ITL from ${sheetRows.length} total rows`);

    // Process rows to handle merged cells - use ITL code to fill missing data
    const processedRows = [];
    let lastValidRow = null;

    for (const row of validRows) {
      const currentITL = row['ITL'] || row['Campaign Name']?.match(/ITL[\s-]*\s?(\d+)/i)?.[1];
      
      // If this row has an ITL code, use it as the reference
      if (currentITL && currentITL.toString().trim() !== '') {
        const processedRow = {
      ...row,
          'ITL': currentITL,
      'Start Date': row['Start Date'] ? new Date(row['Start Date']) : null,
      'Deadline': row['Deadline'] ? new Date(row['Deadline']) : null,
        };
        
        processedRows.push(processedRow);
        lastValidRow = processedRow;
      }
      // If this row doesn't have ITL but has other data, it might be a merged row
      else if (lastValidRow && (row['Campaign Name'] || row['Status'] || row['Tactic'])) {
        // Create a new row with the same ITL but different data
        const mergedRow = {
          ...lastValidRow, // Copy ITL and basic info
          ...row, // Override with new row data
          'ITL': lastValidRow['ITL'], // Ensure ITL is preserved
          'Start Date': row['Start Date'] ? new Date(row['Start Date']) : lastValidRow['Start Date'],
          'Deadline': row['Deadline'] ? new Date(row['Deadline']) : lastValidRow['Deadline'],
        };
        
        processedRows.push(mergedRow);
      }
    }

    const sheetString = JSON.stringify(processedRows);
    const currentHash = crypto.createHash('sha256').update(sheetString).digest('hex');

    const db = mongoose.connection.db;
    const collection = db.collection('sheetdata');

    // If sheet has changed, sync and emit
    if (currentHash !== previousSheetHash) {
      previousSheetHash = currentHash;

      await collection.deleteMany({});
      await collection.insertMany(processedRows);
      console.log(`✅ Synced ${processedRows.length} processed rows to MongoDB`);

      if (io) {
        io.emit('sheetDataUpdated', processedRows);
        console.log('📤 Emitted updated sheet data to all clients');
      }

      return processedRows;
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
    
    // Filter out entries without ITL code
    const validData = allData.filter(row => 
      row['ITL'] && row['ITL'].toString().trim() !== ''
    );
    
    // Convert Date objects back to strings for frontend compatibility
    const formattedData = validData.map(row => ({
      ...row,
      'Start Date': row['Start Date'] ? row['Start Date'].toISOString().split('T')[0] : null,
      'Deadline': row['Deadline'] ? row['Deadline'].toISOString().split('T')[0] : null,
    }));
    
    console.log(`📊 Returning ${formattedData.length} valid rows (with ITL) from ${allData.length} total rows`);
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
async function uploadExcelToMergedLeadReport(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const parsedRows = [];

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const formatted = jsonData.map(row => {
        const campaignName = row['Campaign Name'] || '';
        const itlMatch = campaignName.match(/ITL[\s-]*\s?(\d+)/i);
        const itlCode = itlMatch ? itlMatch[1] : null;

        return {
          ...row,
          itlCode, // Store extracted ITL code
          'Start Date': row['Start Date'] ? new Date(row['Start Date']) : null,
          'Deadline': row['Deadline'] ? new Date(row['Deadline']) : null,
          sheetName,
          uploadedAt: new Date()
        };
      });

      parsedRows.push(...formatted);
    });

    const db = mongoose.connection.db;
    const collection = db.collection('mergedleadreportdata'); // NEW collection for merged

    await collection.insertMany(parsedRows);

    res.status(200).json({
      message: 'Merged Excel uploaded and stored in mergedleadreportdata',
      rowsInserted: parsedRows.length
    });
  } catch (error) {
    console.error('❌ uploadExcelToMergedLeadReport error:', error.message);
    res.status(500).json({ error: error.message });
  }
}


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
  getAllSheetData,
    upload,
  uploadExcelToLeadReport,
  uploadExcelToMergedLeadReport


};
