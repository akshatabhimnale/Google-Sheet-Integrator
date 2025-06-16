const mongoose = require('mongoose');
const CampaignUpdate = require('../models/CampaignUpdate');
const User = require('../models/User');
require('dotenv').config();

const cleanupCampaignUpdates = async () => {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/google-sheet-integrator');
    console.log('✅ Connected to MongoDB');

    console.log('🔍 Finding campaign updates with invalid user references...');
    
    // Find all campaign updates
    const allUpdates = await CampaignUpdate.find({});
    console.log(`📊 Found ${allUpdates.length} total campaign updates`);

    let invalidUpdates = [];
    let validatedCount = 0;

    for (const update of allUpdates) {
      try {
        // Check if the user exists
        const user = await User.findById(update.userId);
        if (!user) {
          invalidUpdates.push(update._id);
          console.log(`❌ Invalid user reference: ${update.userId} in update ${update._id}`);
        } else {
          validatedCount++;
        }
      } catch (error) {
        invalidUpdates.push(update._id);
        console.log(`❌ Error checking user ${update.userId}: ${error.message}`);
      }
    }

    console.log(`✅ Valid updates: ${validatedCount}`);
    console.log(`❌ Invalid updates: ${invalidUpdates.length}`);

    if (invalidUpdates.length > 0) {
      console.log('🗑️  Deleting invalid campaign updates...');
      const deleteResult = await CampaignUpdate.deleteMany({
        _id: { $in: invalidUpdates }
      });
      console.log(`✅ Deleted ${deleteResult.deletedCount} invalid updates`);
    } else {
      console.log('✅ No invalid updates found');
    }

    console.log('🔍 Verifying remaining updates can be populated...');
    const remainingUpdates = await CampaignUpdate.find({})
      .populate('userId', 'name email role avatar');
    
    console.log(`✅ Successfully populated ${remainingUpdates.length} updates`);
    
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
};

// Run cleanup if this script is executed directly
if (require.main === module) {
  cleanupCampaignUpdates();
}

module.exports = cleanupCampaignUpdates; 