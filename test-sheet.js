const { getSheetData } = require('./services/sheet.service');

async function testSheetData() {
  try {
    const data = await getSheetData();
    console.log('Sheet data format:', {
      isArray: Array.isArray(data),
      length: data.length,
      sample: data[0],
      keys: data[0] ? Object.keys(data[0]) : []
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

testSheetData(); 