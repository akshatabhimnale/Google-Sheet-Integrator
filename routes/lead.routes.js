const express = require('express');
const router = express.Router();
const { getLeadAcceptedCounts, getLeadStatsByITL } = require('../controllers/lead.controller');

// Get lead accepted counts for all campaigns
router.get('/counts', getLeadAcceptedCounts);

// Get detailed lead stats for a specific ITL
router.get('/stats/:itl', getLeadStatsByITL);

module.exports = router; 