const express = require('express');
const router = express.Router();
const { testConnection , getStatusSummary } = require('../controllers/sheet.controller');

router.get('/test', testConnection);
router.get('/status-summary', getStatusSummary);

module.exports = router;
