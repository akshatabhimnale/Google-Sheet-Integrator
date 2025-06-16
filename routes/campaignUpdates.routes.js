const express = require('express');
const { getCampaignUpdates, createCampaignUpdate, deleteCampaignUpdate, upload } = require('../controllers/campaignUpdates.controller');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get campaign updates (requires authentication)
router.get('/:campaignId/updates', authenticateToken, getCampaignUpdates);

// Create new campaign update (requires authentication, supports file uploads)
router.post('/:campaignId/updates', authenticateToken, upload.array('attachments', 5), createCampaignUpdate);

// Delete campaign update (requires authentication)
router.delete('/:campaignId/updates/:updateId', authenticateToken, deleteCampaignUpdate);

module.exports = router; 