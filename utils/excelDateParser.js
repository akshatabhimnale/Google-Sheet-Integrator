function excelDateToJSDate(serial) {
  try {
    // Handle Excel serial number
    if (typeof serial === 'number') {
      const utc_days = Math.floor(serial - 25569);
      const utc_value = utc_days * 86400; 
      const date_info = new Date(utc_value * 1000);
      const fractional_day = serial - Math.floor(serial) + 0.0000001;
    
      let total_seconds = Math.floor(86400 * fractional_day);
      const seconds = total_seconds % 60;
      total_seconds -= seconds;
      const hours = Math.floor(total_seconds / (60 * 60));
      const minutes = Math.floor(total_seconds / 60) % 60;
    
      date_info.setHours(hours);
      date_info.setMinutes(minutes);
      date_info.setSeconds(seconds);
      return date_info;
    }
    
    // Handle string dates
    if (typeof serial === 'string') {
      // Try parsing as ISO string first
      const isoDate = new Date(serial);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }
      
      // Try parsing common date formats
      const dateFormats = [
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY
        /(\d{1,2})-(\d{1,2})-(\d{4})/, // MM-DD-YYYY
        /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
        /(\d{1,2})\/(\d{1,2})\/(\d{2})/, // MM/DD/YY
      ];
      
      for (const format of dateFormats) {
        const match = serial.match(format);
        if (match) {
          let year, month, day;
          if (match[1].length === 4) {
            // YYYY-MM-DD format
            year = parseInt(match[1]);
            month = parseInt(match[2]) - 1;
            day = parseInt(match[3]);
          } else {
            // MM/DD/YYYY or MM-DD-YYYY format
            month = parseInt(match[1]) - 1;
            day = parseInt(match[2]);
            year = parseInt(match[3]);
            if (year < 100) year += 2000; // Handle 2-digit years
          }
          
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    }
    
    // If all parsing fails, return null
    return null;
  } catch (error) {
    console.error('Date parsing error:', error);
    return null;
  }
}

// Helper function to standardize date parsing across the application
function parseDate(dateValue) {
  if (!dateValue) return null;
  
  // Try Excel date first
  const excelDate = excelDateToJSDate(dateValue);
  if (excelDate) return excelDate;
  
  // Try direct Date constructor
  const directDate = new Date(dateValue);
  if (!isNaN(directDate.getTime())) return directDate;
  
  return null;
}

// Helper function to format date consistently
function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}
  
module.exports = {
  excelDateToJSDate,
  parseDate,
  formatDate
};
  