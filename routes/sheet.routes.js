const express = require('express');
const router = express.Router();
const { 
  upload,
  handleMulterError,
  uploadExcelToLeadReport,
  uploadExcelToMergedLeadReport,
  testConnection,
  getStatusSummary,
  getCampaignUpdates,
  addCampaignUpdate,
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
  upload.single('file'),
  handleMulterError,
  uploadExcelToLeadReport
);

router.post('/upload-merged-lead-report', 
  upload.single('file'),
  handleMulterError,
  uploadExcelToMergedLeadReport
);

// Campaign updates routes
router.get('/campaigns/:campaignId/updates', getCampaignUpdates);
router.post('/campaigns/:campaignId/updates', addCampaignUpdate);

module.exports = router;
