// scripts/seedUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// adjust path to your connectDB helper and model
const connectDB = require(path.join(__dirname, '..', 'config', 'db')); // ../config/db
const User = require(path.join(__dirname, '..', 'models', 'User')); // ../models/User

async function seedUsers() {
  try {
    await connectDB();
    console.log('✅ Connected to DB');

    // Hash password "1234"
    const passwordHash = await bcrypt.hash('1234', 10);

    // Define the three users
    const usersToSeed = [
      {
        name: 'Admin User',
        email: 'admin',
        password: passwordHash,
        role: 'Admin'
      },
      {
        name: 'Warden User',
        email: 'warden',
        password: passwordHash,
        role: 'Warden'
      },
      {
        name: 'Student User',
        email: 'student',
        password: passwordHash,
        role: 'Student',
        rollNo: 'STU001'
      }
    ];

    console.log('\n🌱 Starting user seeding...\n');

    for (const userData of usersToSeed) {
      // Check if user already exists
      const exists = await User.findOne({ email: userData.email });
      
      if (exists) {
        console.log(`⚠️  User already exists: ${userData.email} (${userData.role})`);
        continue;
      }

      // Create new user
      const user = new User(userData);
      await user.save();
      
      console.log(`✅ Created user: ${userData.email} (${userData.role})`);
      console.log(`   - Name: ${userData.name}`);
      console.log(`   - Email/Username: ${userData.email}`);
      console.log(`   - Password: 1234`);
      console.log(`   - Role: ${userData.role}`);
      if (userData.rollNo) {
        console.log(`   - Roll No: ${userData.rollNo}`);
      }
      console.log('');
    }

    console.log('✅ User seeding completed!\n');
    console.log('📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Admin:');
    console.log('  Username: admin');
    console.log('  Password: 1234');
    console.log('');
    console.log('Warden:');
    console.log('  Username: warden');
    console.log('  Password: 1234');
    console.log('');
    console.log('Student:');
    console.log('  Username: student');
    console.log('  Password: 1234');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

seedUsers();

