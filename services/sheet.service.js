const { google } = require('googleapis');
const sheets = google.sheets('v4');

const auth = new google.auth.GoogleAuth({
  keyFile: './service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const SPREADSHEET_ID = '1vlk913CO1sn6cny2UuLwS88nfkPS4t5aWttTQGR5uYU';

const EXCLUDED_SHEETS = ['Feasibilities', "Campagin Managers' - Updates", 'HTMLs & Feedback'];

async function getSheetData() {
  const client = await auth.getClient();

  // Get all sheet names
  const sheetMeta = await sheets.spreadsheets.get({
    auth: client,
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheetNames = sheetMeta.data.sheets
    .map(sheet => sheet.properties.title)
    .filter(name => !EXCLUDED_SHEETS.includes(name));

  const allData = [];

  for (const name of sheetNames) {
    try {
      const result = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: SPREADSHEET_ID,
        range: `${name}!A1:AG`,
      });

      const [headers, ...rows] = result.data.values || [];

      const sheetData = rows.map(row =>
        headers.reduce((obj, header, i) => {
          obj[header] = row[i] || '';
          return obj;
        }, { sheetName: name })
      );

      allData.push(...sheetData);
    } catch (err) {
      console.warn(`Skipping sheet ${name}:`, err.message);
    }
  }

  return allData;
}

module.exports = { getSheetData };
