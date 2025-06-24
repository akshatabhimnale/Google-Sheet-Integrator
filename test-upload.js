const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1000
  }
});

// Test upload endpoint
app.post('/test-upload',upload.array('files', 1000), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    res.json({
      success: true,
      message: 'File processed successfully',
      data: {
        fileName: req.file.originalname,
        fileSize: req.file.size,
        rowCount: data.length,
        sampleRow: data[0]
      }
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({
      error: 'Error processing file',
      message: error.message
    });
  }
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
}); 