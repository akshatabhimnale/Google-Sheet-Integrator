const mongoose = require('mongoose');

const leadReportSchema = new mongoose.Schema({
  itl: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
leadReportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const LeadReport = mongoose.model('LeadReport', leadReportSchema);

module.exports = LeadReport; 