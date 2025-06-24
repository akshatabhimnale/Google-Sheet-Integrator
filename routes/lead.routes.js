const express = require("express");
const router = express.Router();
const {
  getLeadAcceptedCounts,
  getLeadStatsByITL,
  getBatchAcceptedLeadCounts,
} = require("../controllers/lead.controller");
// Get lead accepted counts for all campaigns
router.get("/counts", getLeadAcceptedCounts);

// Get detailed lead stats for a specific ITL
router.get("/stats/:itl", getLeadStatsByITL);

router.post("/accepted-count-batch", getBatchAcceptedLeadCounts);
module.exports = router;
