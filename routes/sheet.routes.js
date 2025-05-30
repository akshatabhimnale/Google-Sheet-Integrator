const express = require('express');
const router = express.Router();
const { testConnection } = require('../controllers/sheet.controller');

router.get('/test', testConnection);

module.exports = router;
