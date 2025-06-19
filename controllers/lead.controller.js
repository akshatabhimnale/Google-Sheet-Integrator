const LeadReport = require('../models/LeadReport');

// Get lead accepted counts for campaigns
const getLeadAcceptedCounts = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchQuery = { status: 'accepted' };

    // Add date range filter if provided
    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Aggregate to get counts per ITL
    const leadCounts = await LeadReport.aggregate([
      {
        $match: matchQuery
      },
      {
        $group: {
          _id: '$itl',
          acceptedCount: { $sum: 1 },
          lastUpdated: { $max: '$createdAt' }
        }
      },
      {
        $project: {
          _id: 0,
          itl: '$_id',
          acceptedCount: 1,
          lastUpdated: 1
        }
      }
    ]);

    // Create a map for easy lookup
    const leadCountMap = leadCounts.reduce((acc, curr) => {
      acc[curr.itl] = {
        count: curr.acceptedCount,
        lastUpdated: curr.lastUpdated
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: leadCountMap
    });
  } catch (error) {
    console.error('Error fetching lead counts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead counts'
    });
  }
};

// Get detailed lead stats for a specific ITL
const getLeadStatsByITL = async (req, res) => {
  try {
    const { itl } = req.params;
    const { startDate, endDate } = req.query;

    let matchQuery = { 
      itl: itl,
      status: 'accepted'
    };

    // Add date range filter if provided
    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await LeadReport.aggregate([
      {
        $match: matchQuery
      },
      {
        $group: {
          _id: null,
          totalAccepted: { $sum: 1 },
          lastUpdated: { $max: '$createdAt' },
          firstLead: { $min: '$createdAt' }
        }
      }
    ]);

    if (stats.length === 0) {
      return res.json({
        success: true,
        data: {
          itl,
          totalAccepted: 0,
          lastUpdated: null,
          firstLead: null
        }
      });
    }

    res.json({
      success: true,
      data: {
        itl,
        ...stats[0]
      }
    });
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lead stats'
    });
  }
};

module.exports = {
  getLeadAcceptedCounts,
  getLeadStatsByITL
}; 