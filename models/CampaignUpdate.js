const mongoose = require('mongoose');

const campaignUpdateSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String
  }],
  timestamp: {
    type: Date,
    default: Date.now
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  }
});

// Index for efficient querying
campaignUpdateSchema.index({ campaignId: 1, timestamp: -1 });

module.exports = mongoose.model('CampaignUpdate', campaignUpdateSchema); 