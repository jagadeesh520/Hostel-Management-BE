// schedulers/billingScheduler.js
const cron = require('node-cron');
const StudentDue = require('../models/StudentDue');
const { billStudentForMonth } = require('../services/billing');

// helper: returns { month: 1..12, year: 2025 }
function previousMonthAndYear(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1..12
  if (m === 1) return { month: 12, year: y - 1 };
  return { month: m - 1, year: y };
}

async function doBillingForMonth(month, year, opts = {}) {
  const { dryRun = false, batchSize = 100 } = opts;
  console.log(`[BillingScheduler] Start billing for ${year}-${String(month).padStart(2, '0')} (dryRun=${!!dryRun})`);

  const summary = { processed: 0, billed: 0, skipped: 0, errors: 0 };

  const cursor = StudentDue.find()
    .select('rollNo studentName lastBilledMonth messDue estDue')
    .cursor();

  let batch = [];

  const processBatch = async (arr) => {
    for (const doc of arr) {
      summary.processed++;
      try {
        console.log(`[BillingScheduler] Billing student ${doc.rollNo} (${doc.studentName || 'Unknown'})`);
        const res = await billStudentForMonth(doc.rollNo, month, year, {
          dryRun,
          performedBy: 'cron',
          reason: `Last Month ${year}-${String(month).padStart(2,'0')}`
        });
        if (res && res.skipped) {
          summary.skipped++;
          console.log(`  ↳ skipped (already billed)`);
        } else if (res && res.billed) {
          summary.billed++;
          console.log(`  ↳ billed mess=${res.messBill} est=${res.estBill} afterDue=${res.afterTotal ?? res.afterDue ?? '—'}`);
        } else if (res && res.dryRun) {
          console.log(`  ↳ dryRun result mess=${res.messBill} est=${res.estBill}`);
        } else {
          console.log(`  ↳ no action (unknown result)`);
        }
      } catch (err) {
        summary.errors++;
        console.error(`[BillingScheduler] Error billing ${doc.rollNo}:`, err && (err.stack || err.message || err));
      }
    }
  };

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    batch.push(doc);
    if (batch.length >= batchSize) {
      /* eslint-disable no-await-in-loop */
      await processBatch(batch);
      batch = [];
    }
  }
  if (batch.length) await processBatch(batch);

  console.log(`[BillingScheduler] Completed: processed=${summary.processed}, billed=${summary.billed}, skipped=${summary.skipped}, errors=${summary.errors}`);
  return summary;
}

function startBillingScheduler(opts = {}) {
  // Use test schedule in development, production schedule in prod
  let cronExpr;
  if (process.env.NODE_ENV === 'production') {
    cronExpr = opts.cronExpr || '30 0 1 * *'; // monthly in prod
  } else {
    cronExpr = opts.cronExpr || '*/5 * * * *'; // every 5 minutes in non-prod for testing
  }

  // Schedule recurring job
  cron.schedule(cronExpr, async () => {
    console.log(`[BillingScheduler] Triggered at ${new Date().toISOString()}`);
    try {
      const { month, year } = previousMonthAndYear(new Date());
      await doBillingForMonth(month, year, { dryRun: false });
    } catch (err) {
      console.error('[BillingScheduler] cron run failed', err && (err.stack || err.message || err));
    }
  }, {
    scheduled: true,
    timezone: opts.timezone || 'UTC'
  });

  console.log(`[BillingScheduler] Scheduled with expression "${cronExpr}" (env=${process.env.NODE_ENV || 'undefined'}, timezone=${opts.timezone || 'UTC'})`);

  // Run immediately on startup when NOT production (so local dev sees logs right away)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[BillingScheduler] Non-production mode: running initial billing immediately (dryRun=false)...');
    const { month, year } = previousMonthAndYear(new Date());
    // run but don't block startup
    doBillingForMonth(month, year, { dryRun: false })
      .then(() => console.log('[BillingScheduler] Initial run complete'))
      .catch(err => console.error('[BillingScheduler] Initial run failed', err && (err.stack || err.message || err)));
  }
}

// useful test helper to run once (call from server start or REPL)
async function runOnce(dryRun = true) {
  const { month, year } = previousMonthAndYear(new Date());
  return doBillingForMonth(month, year, { dryRun });
}

module.exports = { startBillingScheduler, runOnce, doBillingForMonth };
