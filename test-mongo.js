require('dotenv').config();
const mongoose = require('mongoose');
const { getSheetData } = require('./services/sheet.service');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brianrolf:1lAP1iFaIU8AcHK4@interlink.pdcubpd.mongodb.net/?retryWrites=true&w=majority&appName=Interlink';

async function testMongoConnection() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10,
      minPoolSize: 5,
      retryWrites: true,
      retryReads: true
    });
    console.log('✅ Connected to MongoDB Atlas');

    // Test data insertion
    const testData = {
      itlCode: 'TEST123',
      date: new Date().toISOString().split('T')[0],
      deliveredCount: 1,
      leadIds: ['TEST_LEAD_1'],
      lastUpdated: new Date()
    };

    const result = await mongoose.connection.db.collection('lead_reports').insertOne(testData);
    console.log('✅ Test data inserted:', result);

    // Clean up test data
    await mongoose.connection.db.collection('lead_reports').deleteOne({ itlCode: 'TEST123' });
    console.log('✅ Test data cleaned up');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testMongoConnection(); 