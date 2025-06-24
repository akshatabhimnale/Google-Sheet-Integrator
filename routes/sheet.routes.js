const express = require('express');
const router = express.Router();
const { 
  upload,
  handleMulterError,
  uploadExcelToLeadReport,
  uploadExcelToMergedLeadReport,
  testConnection,
  getStatusSummary,
  getAllSheetData,
  getCampaignDeliveredCount
} = require('../controllers/sheet.controller');

// Test connection route
router.get('/test', testConnection);

// Get all data route
router.get('/data', getAllSheetData);

// Get status summary route
router.get('/status-summary', getStatusSummary);

// Get campaign delivered count route
router.get('/campaign-delivered-count', getCampaignDeliveredCount);

// Upload routes with proper middleware
router.post('/upload-lead-report', 
  upload.array('files', 1000),
  handleMulterError,
  uploadExcelToLeadReport
);

router.post('/upload-merged-lead-report', 
  upload.array('files', 1000),
  handleMulterError,
  uploadExcelToMergedLeadReport
);

module.exports = router;
