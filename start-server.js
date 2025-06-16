const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Google Sheet Integrator Server...\n');

// Check if models directory exists
const modelsDir = path.join(__dirname, 'models');
if (!fs.existsSync(modelsDir)) {
  console.log('❌ Models directory not found.');
  console.log('💡 Please make sure you have run npm install and the models are created.');
  process.exit(1);
}

// Check for required files
const requiredFiles = [
  'models/User.js',
  'models/CampaignUpdate.js',
  'controllers/auth.controller.js',
  'controllers/campaignUpdates.controller.js'
];

let missingFiles = [];
requiredFiles.forEach(file => {
  if (!fs.existsSync(path.join(__dirname, file))) {
    missingFiles.push(file);
  }
});

if (missingFiles.length > 0) {
  console.log('❌ Missing required files:');
  missingFiles.forEach(file => console.log(`   - ${file}`));
  console.log('\n💡 Please ensure all files are created properly.');
  process.exit(1);
}

console.log('✅ All required files found.');

// Check environment variables
if (!process.env.MONGO_URI) {
  console.log('⚠️  Warning: MONGO_URI not found in environment variables.');
  console.log('💡 Please create a .env file with your MongoDB connection string.');
}

// Seed users if needed
console.log('🌱 Checking if users need to be seeded...');

const seedProcess = spawn('node', ['scripts/seedUsers.js'], {
  stdio: 'inherit',
  cwd: __dirname
});

seedProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ User seeding completed successfully.');
    
    // Start the server
    console.log('🚀 Starting the main server...\n');
    
    const serverProcess = spawn('npm', ['run', 'dev'], {
      stdio: 'inherit',
      cwd: __dirname,
      shell: true
    });
    
    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down server...');
      serverProcess.kill('SIGINT');
      process.exit(0);
    });
    
  } else {
    console.log('❌ User seeding failed. Please check your MongoDB connection.');
    console.log('💡 You can still try to start the server manually with: npm run dev');
  }
});

seedProcess.on('error', (error) => {
  console.log('❌ Error during user seeding:', error.message);
  console.log('💡 Starting server anyway...');
  
  // Start the server even if seeding fails
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    cwd: __dirname,
    shell: true
  });
}); 