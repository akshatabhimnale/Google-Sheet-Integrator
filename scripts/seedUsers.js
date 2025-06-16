require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const DEMO_USERS = [
  {
    name: 'John Doe',
    email: 'john.doe@company.com',
    password: 'demo123',
    role: 'Project Manager',
    avatar: '#FF6B6B'
  },
  {
    name: 'Jane Smith',
    email: 'jane.smith@company.com',
    password: 'demo123',
    role: 'Marketing Lead',
    avatar: '#4ECDC4'
  },
  {
    name: 'Mike Wilson',
    email: 'mike.wilson@company.com',
    password: 'demo123',
    role: 'Data Analyst',
    avatar: '#45B7D1'
  },
  {
    name: 'Sarah Brown',
    email: 'sarah.brown@company.com',
    password: 'demo123',
    role: 'Operations',
    avatar: '#96CEB4'
  },
  {
    name: 'Alex Johnson',
    email: 'alex.johnson@company.com',
    password: 'demo123',
    role: 'Quality Assurance',
    avatar: '#FECA57'
  },
  {
    name: 'Kapil Admin',
    email: 'kapil@company.com',
    password: 'admin123',
    role: 'Admin',
    avatar: '#FF8A80'
  }
];

async function seedUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    console.log('🗑️ Cleared existing users');

    // Create users
    for (const userData of DEMO_USERS) {
      const user = new User(userData);
      await user.save();
      console.log(`✅ Created user: ${userData.name} (${userData.email})`);
    }

    console.log('🎉 Successfully seeded users!');
    console.log('\n📋 Available Users:');
    DEMO_USERS.forEach(user => {
      console.log(`   ${user.name} - ${user.email} (${user.password})`);
    });

  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

seedUsers(); 