const mongoose = require('mongoose');

const LeadReportSchema = new mongoose.Schema({
  itlCode: String,
  date: Date,
  acceptedCount: Number,
  rejectedCount: Number,
  acceptedLeadIds: [String],
  rejectedLeadIds: [String],
  lastUpdated: Date
}, { collection: 'lead_reports' });

module.exports = mongoose.model('LeadReport', LeadReportSchema); 