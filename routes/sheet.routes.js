const express = require('express');
const router = express.Router();
const { 
  testConnection, 
  getStatusSummary, 
  getCampaignUpdates, 
  addCampaignUpdate,
  getAllSheetData
} = require('../controllers/sheet.controller');

router.get('/test', testConnection);
router.get('/data', getAllSheetData);
router.get('/status-summary', getStatusSummary);

// Campaign updates routes
router.get('/campaigns/:campaignId/updates', getCampaignUpdates);
router.post('/campaigns/:campaignId/updates', addCampaignUpdate);

module.exports = router;
