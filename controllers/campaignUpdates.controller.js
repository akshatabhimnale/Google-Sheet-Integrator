const CampaignUpdate = require('../models/CampaignUpdate');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Helper function to safely transform update data
const transformUpdateSafely = (update) => {
  const user = update.userId || {};
  const isPopulated = user._id !== undefined;
  
  return {
    _id: update._id,
    campaignId: update.campaignId,
    message: update.message,
    timestamp: update.timestamp,
    attachments: update.attachments || [],
    edited: update.edited || false,
    editedAt: update.editedAt,
    user: {
      id: isPopulated ? user._id : user,
      name: isPopulated ? user.name : 'Unknown User',
      email: isPopulated ? user.email : 'unknown@example.com',
      role: isPopulated ? user.role : 'User',
      avatar: isPopulated ? user.avatar : '#6b7280'
    }
  };
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/campaign-attachments';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1000
  },
  fileFilter: (req, file, cb) => {
    // Allow images, PDFs, documents, Excel, CSV, and ZIP files
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|svg|pdf|doc|docx|txt|xlsx|xls|csv|zip|ppt|pptx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, documents, Excel, CSV, and ZIP files are allowed'));
    }
  }
});

// Get campaign updates
const getCampaignUpdates = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required'
      });
    }

    const updates = await CampaignUpdate.find({ campaignId })
      .populate('userId', 'name email role avatar')
      .sort({ timestamp: 1 }); // Oldest first

    // Transform data for frontend compatibility with safety checks
    const transformedUpdates = updates.map(transformUpdateSafely);

    res.json({
      success: true,
      updates: transformedUpdates
    });
  } catch (error) {
    console.error('Get campaign updates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching updates'
    });
  }
};

// Create new campaign update
const createCampaignUpdate = async (req, res) => {
  try {
    console.log('Creating campaign update...');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    console.log('Request params:', req.params);
    
    const { campaignId } = req.params;
    const { message, userId, userName } = req.body;
    
    // Use authenticated user ID if available, otherwise use provided user info
    const currentUserId = req.userId || userId;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required'
      });
    }

    // Allow updates with only attachments (no message required)
    const hasMessage = message && message.trim().length > 0;
    const hasAttachments = req.files && req.files.length > 0;
    
    console.log('Has message:', hasMessage);
    console.log('Has attachments:', hasAttachments);
    
    if (!hasMessage && !hasAttachments) {
      return res.status(400).json({
        success: false,
        message: 'Either a message or attachments are required'
      });
    }

    // If no authenticated user, create a default user or use provided info
    let finalUserId = currentUserId;
    if (!finalUserId) {
      // Create a default user for demo purposes
      const defaultUser = await User.findOne({ role: 'Admin' }) || await User.findOne();
      if (defaultUser) {
        finalUserId = defaultUser._id;
      } else {
        return res.status(400).json({
          success: false,
          message: 'User authentication required'
        });
      }
    }

    // Process attachments if any
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: `/uploads/campaign-attachments/${file.filename}`
        });
      });
    }

    // Create new update
    const update = new CampaignUpdate({
      campaignId,
      userId: finalUserId,
      message: hasMessage ? message.trim() : '',
      attachments
    });

    await update.save();

    // Populate user data for response
    await update.populate('userId', 'name email role avatar');

    // Transform for frontend with safety checks
    const transformedUpdate = transformUpdateSafely(update);

    // Emit to all connected clients via socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('new-campaign-update', transformedUpdate);
    }

    res.status(201).json({
      success: true,
      message: 'Update created successfully',
      update: transformedUpdate
    });
  } catch (error) {
    console.error('Create campaign update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating update'
    });
  }
};

// Delete campaign update (only by author or admin)
const deleteCampaignUpdate = async (req, res) => {
  try {
    const { campaignId, updateId } = req.params;
    const userId = req.userId;

    const update = await CampaignUpdate.findOne({
      _id: updateId,
      campaignId: campaignId
    });

    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found'
      });
    }

    // Check if user can delete (author or admin)
    const user = await User.findById(userId);
    if (update.userId.toString() !== userId.toString() && user.role !== 'Admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this update'
      });
    }

    // Delete associated files
    if (update.attachments && update.attachments.length > 0) {
      update.attachments.forEach(attachment => {
        const filePath = path.join(__dirname, '..', attachment.url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }

    await CampaignUpdate.deleteOne({ _id: updateId });

    // Emit to all connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('campaign-update-deleted', { campaignId, updateId });
    }

    res.json({
      success: true,
      message: 'Update deleted successfully'
    });
  } catch (error) {
    console.error('Delete campaign update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting update'
    });
  }
};

module.exports = {
  getCampaignUpdates,
  createCampaignUpdate,
  deleteCampaignUpdate,
  upload
}; 