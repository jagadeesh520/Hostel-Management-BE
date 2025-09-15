// scripts/seedHostelOfficer.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// adjust path to your connectDB helper and model
const connectDB = require(path.join(__dirname, '..', 'config', 'db')); // ../config/db
const HostelOfficer = require(path.join(__dirname, '..', 'models', 'HostelOfficer')); // ../models/HostelOfficer

async function seed() {
  try {
    await connectDB();
    console.log('Connected to DB');

    const name = process.argv[2] || 'Hostel Officer';
    const email = (process.argv[3] || 'officer@example.com').toLowerCase().trim();
    const plain = process.argv[4] || 'secret123';

    // check existing
    const exists = await HostelOfficer.findOne({ email });
    if (exists) {
      console.log('User already exists:', exists.email);
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(plain, 10);

    const officer = new HostelOfficer({
      name,
      email,
      passwordHash,
      role: 'HostelOfficer',
      createdAt: new Date()
    });

    await officer.save();
    console.log('HostelOfficer created:', { id: officer._id.toString(), email: officer.email });
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
