const express = require('express');
const { getCampaignUpdates, createCampaignUpdate, deleteCampaignUpdate, upload } = require('../controllers/campaignUpdates.controller');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get campaign updates (temporarily without authentication for testing)
router.get('/:campaignId/updates', getCampaignUpdates);

// Create new campaign update (temporarily without authentication for testing)
router.post('/:campaignId/updates', upload.array('attachments', 5), createCampaignUpdate);

// Delete campaign update (requires authentication)
router.delete('/:campaignId/updates/:updateId', authenticateToken, deleteCampaignUpdate);

module.exports = router; 