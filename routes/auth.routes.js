const express = require('express');
const { login, logout, register, getProfile, getAllUsers } = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/register', register);

// Protected routes
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);
router.get('/users', authenticateToken, getAllUsers);

module.exports = router; 