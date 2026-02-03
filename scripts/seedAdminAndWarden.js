// scripts/seedAdminAndWarden.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Import dependencies
const connectDB = require(path.join(__dirname, '..', 'config', 'db'));
const User = require(path.join(__dirname, '..', 'models', 'User'));
const Warden = require(path.join(__dirname, '..', 'models', 'Warden'));

async function seedAdminAndWarden() {
  try {
    await connectDB();
    console.log('✅ Connected to DB');

    // Hash password - default is "password123"
    const passwordHash = await bcrypt.hash('password123', 10);

    // Admin credentials
    const adminUser = {
      name: 'Admin User',
      email: 'admin@hostel.com',
      password: passwordHash,
      role: 'Admin'
    };

    // Warden credentials
    const wardenUsers = [
      {
        user: {
          name: 'Warden - Boys Block A',
          email: 'warden.boysa@hostel.com',
          password: passwordHash,
          role: 'Warden'
        },
        warden: {
          name: 'Warden - Boys Block A',
          phone: '+91-9876543210',
          block: 'Block A',
          hostelType: 'Boys'
        }
      },
      {
        user: {
          name: 'Warden - Boys Block B',
          email: 'warden.boysb@hostel.com',
          password: passwordHash,
          role: 'Warden'
        },
        warden: {
          name: 'Warden - Boys Block B',
          phone: '+91-9876543211',
          block: 'Block B',
          hostelType: 'Boys'
        }
      },
      {
        user: {
          name: 'Warden - Girls Block A',
          email: 'warden.girlsa@hostel.com',
          password: passwordHash,
          role: 'Warden'
        },
        warden: {
          name: 'Warden - Girls Block A',
          phone: '+91-9876543212',
          block: 'Block A',
          hostelType: 'Girls'
        }
      },
      {
        user: {
          name: 'Warden - Girls Block B',
          email: 'warden.girlsb@hostel.com',
          password: passwordHash,
          role: 'Warden'
        },
        warden: {
          name: 'Warden - Girls Block B',
          phone: '+91-9876543213',
          block: 'Block B',
          hostelType: 'Girls'
        }
      }
    ];

    console.log('\n🌱 Starting Admin and Warden seeding...\n');

    // Seed Admin User
    const adminExists = await User.findOne({ email: adminUser.email });
    if (adminExists) {
      console.log(`⚠️  Admin user already exists: ${adminUser.email}`);
    } else {
      const newAdmin = new User(adminUser);
      await newAdmin.save();
      console.log(`✅ Admin created: ${adminUser.email} (Password: password123)`);
    }

    // Seed Warden Users and Warden records
    for (const wardenData of wardenUsers) {
      const userExists = await User.findOne({ email: wardenData.user.email });
      const wardenExists = await Warden.findOne({ 
        name: wardenData.warden.name,
        block: wardenData.warden.block,
        hostelType: wardenData.warden.hostelType
      });

      if (userExists) {
        console.log(`⚠️  Warden user already exists: ${wardenData.user.email}`);
      } else {
        const newWardenUser = new User(wardenData.user);
        await newWardenUser.save();
        console.log(`✅ Warden user created: ${wardenData.user.email} (Password: password123)`);
      }

      if (wardenExists) {
        console.log(`⚠️  Warden record already exists: ${wardenData.warden.name}`);
      } else {
        const newWarden = new Warden(wardenData.warden);
        await newWarden.save();
        console.log(`✅ Warden record created: ${wardenData.warden.name}`);
      }
    }

    console.log('\n✅ Seeding completed successfully!\n');
    console.log('📝 Default credentials:');
    console.log('   Email: Use the email addresses shown above');
    console.log('   Password: password123\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seedAdminAndWarden();
