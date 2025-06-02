// sheetService.js
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

  // 1. Get all sheet names
  const meta = await sheets.spreadsheets.get({
    auth: client,
    spreadsheetId: SPREADSHEET_ID,
  });

  const sheetTitles = meta.data.sheets
    .map(sheet => sheet.properties.title)
    .filter(title => !EXCLUDED_SHEETS.includes(title));

  const allData = [];

  // 2. Fetch data from each allowed sheet
  for (const title of sheetTitles) {
    try {
      const res = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: SPREADSHEET_ID,
        range: `${title}!A1:AE`,
      });

      const values = res.data.values;
      if (!values || values.length < 2) continue;

      const [headers, ...rows] = values;
      const sheetData = rows.map(row =>
        headers.reduce((obj, header, i) => {
          obj[header] = row[i] || '';
          obj.sheet = title; // Optional: track which sheet this row came from
          return obj;
        }, {})
      );

      allData.push(...sheetData);
    } catch (err) {
      console.warn(`Failed to fetch sheet "${title}":`, err.message);
    }
  }

  return allData;
}

module.exports = { getSheetData };
