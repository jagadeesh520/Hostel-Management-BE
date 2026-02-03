const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./models/Student'); // Assuming User model is in Student.js

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Create test admin user
    const adminUser = {
      email: 'admin@hostel.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'Admin',
      phone: '9999999999',
      rollNo: 'ADMIN001',
      hostelId: 'H001'
    };

    // Check if user exists
    const existingAdmin = await User.findOne({ email: 'admin@hostel.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
    } else {
      await User.create(adminUser);
      console.log('✅ Admin user created: admin@hostel.com / password123');
    }

    // Create test student user
    const studentUser = {
      email: 'student@hostel.com',
      password: hashedPassword,
      name: 'Test Student',
      role: 'Student',
      phone: '9999999998',
      rollNo: 'CS001',
      hostelId: 'H001'
    };

    const existingStudent = await User.findOne({ email: 'student@hostel.com' });
    if (existingStudent) {
      console.log('⚠️  Student user already exists');
    } else {
      await User.create(studentUser);
      console.log('✅ Student user created: student@hostel.com / password123');
    }

    console.log('✅ Seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

seedDatabase();
