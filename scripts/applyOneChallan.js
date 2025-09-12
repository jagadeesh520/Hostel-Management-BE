// scripts/applyOneChallan.js
/* Run: set MONGO_URI and optional ID env (see README below). */
const path = require('path');
const mongoose = require('mongoose');

// resolve models relative to project root (script lives in ./scripts)
const projectRoot = path.join(__dirname, '..');
const Challan = require(path.join(projectRoot, 'models', 'Challan'));
const { applyApprovedChallan, findAmountInChallan } = require(path.join(projectRoot, 'utils', 'paymentUtils'));

const MONGO = process.env.MONGO_URI;
const ID = process.env.ID || '68c2c05dd98b7de8b4283d3b';

async function run() {
  if (!MONGO) {
    console.error('ERROR: MONGO_URI environment variable not set. Example:');
    console.error('  $env:MONGO_URI="mongodb+srv://user:pw@cluster0.../dbname"');
    process.exit(2);
  }
  if (!ID) {
    console.error('ERROR: challan ID not provided (env ID).');
    process.exit(2);
  }

  console.log('Connecting to Mongo...');
  try {
    await mongoose.connect(MONGO, {
      // modern driver options; avoid deprecated flags
      // keep poolSize/other tune here if needed
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB. Error:');
    console.error(err && (err.stack || err.message || err));
    process.exit(3);
  }

  try {
    console.log('Connected. Looking up Challan id=', ID);
    const challan = await Challan.findById(ID).lean();
    if (!challan) {
      console.error('Challan not found for id:', ID);
      await mongoose.disconnect();
      process.exit(4);
    }

    console.log('Challan (raw):');
    console.dir(challan, { depth: 3, colors: true });

    const parsed = findAmountInChallan(challan);
    console.log('Parsed amount from challan:', parsed);

    if (!parsed || Number.isNaN(parsed) || parsed <= 0) {
      console.error('Parsed amount invalid. Possible reasons: amount is nested under an unexpected key or stored as non-numeric.');
      console.error('Look at the printed challan above to find where the numeric amount is stored (e.g. challan.fields.amount).');
      await mongoose.disconnect();
      process.exit(5);
    }

    console.log('Attempting to apply challan to dues...');
    const result = await applyApprovedChallan(ID);
    console.log('apply result:', result);

    if (result && result.applied === true) {
      console.log('Success: StudentDue should be updated. StudentDue snapshot:');
      console.dir(result.studentDue, { depth: 2, colors: true });
      await mongoose.disconnect();
      process.exit(0);
    } else {
      console.error('applyApprovedChallan did not apply. result=', result);
      await mongoose.disconnect();
      process.exit(6);
    }
  } catch (err) {
    console.error('Unhandled error while applying challan:', err && (err.stack || err.message || err));
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
}

run();
