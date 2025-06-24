const mongoose = require("mongoose");

const leadReportSchema = new mongoose.Schema({
  itlCode: {
    type: String,
    required: true,
    index: true,
  },
  date: {
    type: String, // OR Date, but you are storing as string like "2025-05-28"
    required: true,
    index: true,
  },
  acceptedCount: {
    type: Number,
    default: 0,
  },
  acceptedLeadIds: [String],
  rejectedCount: {
    type: Number,
    default: 0,
  },
  rejectedLeadIds: [String],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
leadReportSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  // Ensure itlCode is set from itl if not provided
  if (!this.itlCode && this.itl) {
    const match = this.itl.match(/ITL\s*-*\s*(\d{4})/i);
    if (match) {
      this.itlCode = match[1];
    }
  }

  next();
});

const LeadReport = mongoose.model(
  "LeadReport",
  leadReportSchema,
  "lead_reports"
);

module.exports = LeadReport;
