const { getSheetData } = require('../services/sheet.service');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const XLSX = require('xlsx');
const LeadReport = require('../models/LeadReport');

// Configure multer for file upload
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  // Accept Excel files and CSV files
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls') ||
      file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) and CSV files (.csv) are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 1000 // Allow multiple files
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

let previousSheetHash = '';
let isSyncRunning = false; // Add sync lock
const { excelDateToJSDate } = require('../utils/excelDateParser');
/**
 * Syncs Google Sheet data to MongoDB and returns the new data.
 * If `io` is provided, emits 'sheetDataUpdated' only on changes.
 */
async function uploadExcelToLeadReport(req, res) {
  try {
    // Validate file upload
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (!mongoose.connection.readyState) {
      return res.status(503).json({ error: 'Database connection not available.' });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

    const acceptedMap = new Map();
    const rejectedMap = new Map();
    const processedLeads = new Set();
    let processedRows = 0, skippedRows = 0, errors = 0;

    for (const file of files) {
      // Validate file type and size
      if (!file.mimetype.includes('excel') && !file.mimetype.includes('spreadsheet') && !file.mimetype.includes('csv')) {
        skippedRows++;
        continue;
      }
      if (file.size > MAX_FILE_SIZE || !file.buffer || file.buffer.length === 0) {
        skippedRows++;
        continue;
      }

      let workbook;
      try {
        workbook = XLSX.read(file.buffer, { type: 'buffer' });
      } catch (err) {
        console.error('Excel parsing error:', err);
        errors++;
        continue;
      }

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        skippedRows++;
        continue;
      }

      for (const sheetName of workbook.SheetNames) {
        try {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (!rows || rows.length === 0) continue;

          for (const row of rows) {
            try {
              // More robust field mapping with fallbacks
              const rowKeys = Object.keys(row);
              const leadId = row['Lead ID'] || row['LeadID'] || row['ID'] || row[rowKeys[0]];
              const updatedTimestampRaw = row['Updated Timestamp'] || row['Timestamp'] || row['Date'] || row[rowKeys[1]];
              const rawITL = row['ITL'] || row['ITL Code'] || row['Campaign ITL'] || row[rowKeys[6]];
              const status = (row['Status'] || row['status'] || '').trim().toLowerCase();

              if (!leadId || !rawITL) {
                skippedRows++;
                continue;
              }

              const leadKey = `${leadId}_${rawITL}_${status}`;
              if (processedLeads.has(leadKey)) {
                skippedRows++;
                continue;
              }
              processedLeads.add(leadKey);

              const match = rawITL.match(/ITL\s*-*\s*(\d{4})/i);
              if (!match) {
                skippedRows++;
                continue;
              }

              const itlCode = match[1];
              let dateOnly = null;

              if (updatedTimestampRaw) {
                let parsedDate = null;
                if (typeof updatedTimestampRaw === 'number') {
                  parsedDate = excelDateToJSDate(updatedTimestampRaw);
                } else if (typeof updatedTimestampRaw === 'string') {
                  const tempDate = new Date(updatedTimestampRaw);
                  if (!isNaN(tempDate.getTime())) parsedDate = tempDate;
                }
                if (parsedDate) dateOnly = parsedDate.toISOString().split('T')[0];
              }

              if (!dateOnly) {
                skippedRows++;
                continue;
              }

              processedRows++;
              const key = `${itlCode}_${dateOnly}`;

              if (!acceptedMap.has(key)) {
                acceptedMap.set(key, {
                  itlCode, date: dateOnly,
                  acceptedCount: 0, rejectedCount: 0,
                  acceptedLeadIds: new Set(), rejectedLeadIds: new Set(),
                  lastUpdated: new Date()
                });
              }
              if (!rejectedMap.has(key)) {
                rejectedMap.set(key, {
                  itlCode, date: dateOnly,
                  acceptedCount: 0, rejectedCount: 0,
                  acceptedLeadIds: new Set(), rejectedLeadIds: new Set(),
                  lastUpdated: new Date()
                });
              }

              if (status === 'rejected') {
                rejectedMap.get(key).rejectedCount++;
                rejectedMap.get(key).rejectedLeadIds.add(leadId);
                rejectedMap.get(key).lastUpdated = new Date();
              } else {
                acceptedMap.get(key).acceptedCount++;
                acceptedMap.get(key).acceptedLeadIds.add(leadId);
                acceptedMap.get(key).lastUpdated = new Date();
              }
            } catch (rowErr) {
              console.error('Row processing error:', rowErr);
              errors++;
            }
          }
        } catch (sheetErr) {
          console.error('Sheet processing error:', sheetErr);
          errors++;
        }
      }
    }

    if (processedRows === 0) {
      return res.status(400).json({ error: 'No valid data found in uploaded file.' });
    }

    // Prepare bulk operations for MongoDB
    const bulkOps = [];

    for (const [key, entry] of acceptedMap) {
      if (entry.acceptedCount > 0) {
        bulkOps.push({
          updateOne: {
            filter: { itlCode: entry.itlCode, date: entry.date },
            update: {
              $set: {
                itlCode: entry.itlCode,
                date: entry.date,
                acceptedCount: entry.acceptedCount,
                acceptedLeadIds: Array.from(entry.acceptedLeadIds),
                lastUpdated: entry.lastUpdated
              }
            },
            upsert: true
          }
        });
      }
    }

    for (const [key, entry] of rejectedMap) {
      if (entry.rejectedCount > 0) {
        bulkOps.push({
          updateOne: {
            filter: { itlCode: entry.itlCode, date: entry.date },
            update: {
              $set: {
                itlCode: entry.itlCode,
                date: entry.date,
                rejectedCount: entry.rejectedCount,
                rejectedLeadIds: Array.from(entry.rejectedLeadIds),
                lastUpdated: entry.lastUpdated
              }
            },
            upsert: true
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await mongoose.connection.db.collection('lead_reports').bulkWrite(bulkOps);
    }

    return res.json({
      success: true,
      message: 'File processed successfully',
      stats: {
        totalRows: processedRows + skippedRows + errors,
        processedRows, skippedRows, errors
      }
    });

  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


module.exports = {
  upload,
  handleMulterError,
  uploadExcelToLeadReport,
  uploadExcelToMergedLeadReport,
  testConnection,
  getStatusSummary,
  getCampaignUpdates,
  addCampaignUpdate,
  getAllSheetData,
  syncSheetToDatabase,
  getCampaignDeliveredCount
};

async function syncSheetToDatabase(io) {
  // Prevent multiple syncs from running simultaneously
  if (isSyncRunning) {
    console.log('🔄 Sync already in progress, skipping...');
    return {
      success: false,
      message: 'Sync already in progress'
    };
  }

  isSyncRunning = true;
  
  try {
    // Check MongoDB connection
    if (!mongoose.connection.readyState) {
      throw new Error('Database connection not available');
    }

    const sheetData = await getSheetData();
    if (!sheetData || !Array.isArray(sheetData)) {
      throw new Error('Invalid sheet data format');
    }

    let processedRows = 0;
    let skippedRows = 0;
    let errors = 0;

    // --- Mirror Sync: Build set of keys from sheet ---
    const sheetKeys = new Set();
    for (const row of sheetData) {
      if (row.ITL && row['Start Date']) {
        const itlCode = row.ITL;
        let dateStr = '';
const date = new Date(row['Start Date']);
if (date instanceof Date && !isNaN(date.getTime())) {
  dateStr = date.toISOString().split('T')[0];
} else {
  console.warn(`⚠️ Invalid date found for ITL ${itlCode}: ${row['Start Date']}`);
  skippedRows++;
  continue;  // skip this row if date invalid
}
sheetKeys.add(`${itlCode}_${dateStr}`);

       
      }
    }

    // --- Upsert logic (existing code) ---
    // Process rows in batches
    const batchSize = 100;
    for (let i = 0; i < sheetData.length; i += batchSize) {
      const batch = sheetData.slice(i, i + batchSize);
      
      try {
        const processedBatch = batch.map(row => {
          try {
            if (!row || !row.ITL || !row.Status) {
              skippedRows++;
              return null;
            }

            // Clean and validate the data
            const cleanedRow = {
              sheetName: row.sheetName || '',
              date: row.Date || '',
              campaignName: row['Campaign Name'] || '',
              itl: row.ITL || '',
              tactic: row.Tactic || '',
              cidNotes: row['CID - Notes'] || '',
              dataComments: row['Data/Kapil Comments'] || '',
              pacing: row.Pacing || '',
              deliveryDays: row['Delivery Days'] || '',
              leadsBooked: parseInt(row['Leads Booked']) || 0,
              leadSent: parseInt(row['Lead Sent']) || 0,
              shortfall: parseInt(row.Shortfall) || 0,
              startDate: row['Start Date'] || '',
              deadline: row.Deadline || '',
              status: row.Status || '',
              campaignAssignees: row['Campaign Assignees'] || '',
              dataCount: parseInt(row['Data count']) || 0,
              opsCount: parseInt(row['Ops Count']) || 0,
              qualityCount: parseInt(row['Quality Count']) || 0,
              misCount: parseInt(row['MIS Count']) || 0,
              opsInsights: row['Ops Insights'] || '',
              emailInsights: row['Email insights'] || '',
              deliveryInsights: row['Delivery insights'] || '',
              lastUpdated: new Date()
            };

            processedRows++;
            return cleanedRow;
          } catch (error) {
            console.error('Error processing row:', error);
            errors++;
            return null;
          }
        }).filter(Boolean);

        if (processedBatch.length > 0) {
          const collection = mongoose.connection.db.collection('sheetdata');
          for (const row of processedBatch) {
            // Use a unique key, e.g., ITL + Start Date
            await collection.updateOne(
              { ITL: row.itl, 'Start Date': row.startDate },
              { $set: row },
              { upsert: true }
            );
          }
        }

        // Emit progress update
        if (io) {
          io.emit('syncProgress', {
            processed: processedRows,
            total: sheetData.length,
            skipped: skippedRows,
            errors: errors
          });
        }
      } catch (batchError) {
        console.error('Error processing batch:', batchError);
        errors += batch.length;
      }
    }

    // --- Mirror Sync: Delete records not in sheet ---
    const allDbRecords = await LeadReport.find({}, 'itlCode date');
    const dbKeys = allDbRecords.map(r => `${r.itlCode}_${r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date}`);
    const keysToDelete = dbKeys.filter(key => !sheetKeys.has(key));
    for (const key of keysToDelete) {
      const [itlCode, date] = key.split('_');
      await LeadReport.deleteOne({ itlCode, date: new Date(date) });
    }

    // Emit updated sheet data to all clients via Socket.IO
    if (io) {
      const db = mongoose.connection.db;
      const collection = db.collection('sheetdata');
      const allData = await collection.find({}).toArray();
      io.emit('sheetDataUpdated', allData);
    }

    return {
      success: true,
      message: 'Data sync completed successfully',
      stats: {
        processed: processedRows,
        skipped: skippedRows,
        errors: errors
      }
    };
  } catch (error) {
    console.error('❌ Sync error:', error);
    return {
      success: false,
      message: 'Sync failed',
      error: error.message
    };
  } finally {
    isSyncRunning = false; // Release sync lock
  }
}

/**
 * API to get all sheet data for the dashboard
 */
async function getAllSheetData(req, res) {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('sheetdata');
    const { startDate, endDate } = req.query;
    let allData;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Filter: Only Start Date falls within the range
      allData = await collection.find({
        'Start Date': { $gte: start, $lte: end }
      }).toArray();
    } else {
      allData = await collection.find({}).toArray();
    }
    
    // Filter out entries without ITL code
    const validData = allData.filter(row => 
      row['ITL'] && row['ITL'].toString().trim() !== ''
    );
    
    // Convert Date objects back to strings for frontend compatibility
    const formattedData = validData.map(row => ({
      ...row,
      'Start Date': row['Start Date']
        ? (row['Start Date'] instanceof Date
            ? row['Start Date'].toISOString().split('T')[0]
            : new Date(row['Start Date']).toISOString().split('T')[0])
        : null,
      'Deadline': row['Deadline']
        ? (row['Deadline'] instanceof Date
            ? row['Deadline'].toISOString().split('T')[0]
            : new Date(row['Deadline']).toISOString().split('T')[0])
        : null,
    }));
    
    console.log(`📊 Returning ${formattedData.length} valid rows (with ITL) from ${allData.length} total rows`);
    res.json({ data: formattedData });
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

async function getCampaignDeliveredCount(req, res) {
  try {
    const { campaignCode, startDate, endDate } = req.query;

    // Build date filter if dates are provided
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Build query
    const query = { ...dateFilter };
    if (campaignCode) {
      query.itlCode = campaignCode;
    }

    // Find all lead reports for the campaign code or all campaigns
    const leadReports = await mongoose.model('LeadReport').find(query);

    // Calculate total delivered count (accepted leads)
    const deliveredCount = leadReports.reduce((total, report) => {
      return total + (report.acceptedLeadIds?.length || 0);
    }, 0);

    // Get daily breakdown
    const dailyBreakdown = leadReports.reduce((breakdown, report) => {
      const date = report.date.toISOString().split('T')[0];
      if (!breakdown[date]) {
        breakdown[date] = 0;
      }
      breakdown[date] += report.acceptedLeadIds?.length || 0;
      return breakdown;
    }, {});

    return res.json({
      success: true,
      data: {
        campaignCode,
        totalDelivered: deliveredCount,
        dailyBreakdown,
        dateRange: {
          start: startDate,
          end: endDate
        }
      }
    });

  } catch (error) {
    console.error('Error getting campaign delivered count:', error);
    return res.status(500).json({ 
      error: 'Failed to get campaign delivered count',
      details: error.message 
    });
  }
}
