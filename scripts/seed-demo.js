// Seed realistic demo sessions for the main user account.
// Run: node scripts/seed-demo.js
// Requires MONGODB_URI in .env or environment.

import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim();
    }
  }
} catch {}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

// ── Demo user ──────────────────────────────────────────────────────────────────
// The main account that signed in and generated real sessions.
const DEMO_USER_ID = 'user_3ESFT03NVT49JfEUZIq8S4tbW6h';

// ── Helper ─────────────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

// ── Sessions to insert ─────────────────────────────────────────────────────────
// Goal state:
//   Mayamalavagowla → stable (6 sessions, 4 identified/likely, last practiced yesterday)
//   Keeravani       → developing + stale (4 total sessions, 1 identified, last practiced 4d ago)
//   Keeravani ↔ Tanarupi → confusion pair (count: 2, from tutor sessions)

const SEED_SESSIONS = [
  // ── Mayamalavagowla — stable, practiced recently ──────────────────────────
  { raga: 'Mayamalavagowla', tool: 'tutor', outcome: 'identified', confidence: 'high',  timestamp: daysAgo(1) },
  { raga: 'Mayamalavagowla', tool: 'tutor', outcome: 'likely',     confidence: 'medium', timestamp: daysAgo(1) },
  { raga: 'Mayamalavagowla', tool: 'tutor', outcome: 'identified', confidence: 'high',  timestamp: daysAgo(2) },
  { raga: 'Mayamalavagowla', tool: 'tutor', outcome: 'identified', confidence: 'high',  timestamp: daysAgo(5) },
  { raga: 'Mayamalavagowla', tool: 'tutor', outcome: 'likely',     confidence: 'medium', timestamp: daysAgo(9) },
  { raga: 'Mayamalavagowla', tool: 'tutor', outcome: 'ambiguous',  confidence: 'low',   timestamp: daysAgo(12) },

  // ── Keeravani — developing, stale (last practiced 4 days ago), confusion with Tanarupi ──
  { raga: 'Keeravani', tool: 'tutor', outcome: 'ambiguous',  confidence: 'low',  confusedWith: 'Tanarupi', timestamp: daysAgo(4) },
  { raga: 'Keeravani', tool: 'tutor', outcome: 'ambiguous',  confidence: 'low',  confusedWith: 'Tanarupi', timestamp: daysAgo(7) },
  { raga: 'Keeravani', tool: 'tutor', outcome: 'identified', confidence: 'high', timestamp: daysAgo(11) },
];

// ── Run ────────────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db('alapana');

  // Remove any existing seed sessions for this user so re-running is safe
  const del = await db.collection('sessions').deleteMany({
    userId: DEMO_USER_ID,
    tool: 'tutor',
    raga: { $in: ['Mayamalavagowla', 'Keeravani'] },
  });
  console.log(`Removed ${del.deletedCount} existing demo sessions`);

  // Insert seed sessions
  const docs = SEED_SESSIONS.map(s => ({ userId: DEMO_USER_ID, ...s }));
  const result = await db.collection('sessions').insertMany(docs);
  console.log(`Inserted ${result.insertedCount} seed sessions`);

  // Verify the learner model state
  const ragaStats = await db.collection('sessions').aggregate([
    { $match: { userId: DEMO_USER_ID, raga: { $exists: true, $nin: ['', null] } } },
    { $group: {
        _id: '$raga',
        totalSessions: { $sum: 1 },
        identifiedCount: { $sum: { $cond: [{ $in: ['$outcome', ['identified', 'likely']] }, 1, 0] } },
        lastPracticed: { $max: '$timestamp' },
    }},
    { $sort: { totalSessions: -1 } },
  ]).toArray();

  const confusionPairs = await db.collection('sessions').aggregate([
    { $match: { userId: DEMO_USER_ID, tool: { $in: ['tutor', 'singback', 'lesson-feedback'] }, confusedWith: { $exists: true, $nin: ['', null] }, raga: { $exists: true, $nin: ['', null] } } },
    { $group: { _id: { raga: '$raga', confusedWith: '$confusedWith' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  console.log('\n── Resulting learner model ──────────────────────────────');
  for (const r of ragaStats) {
    const sr = r.totalSessions > 0 ? r.identifiedCount / r.totalSessions : 0;
    const level =
      r.totalSessions >= 8 && sr >= 0.7 ? 'strong' :
      r.totalSessions >= 4 && sr >= 0.5 ? 'stable' :
      r.totalSessions >= 2 || r.identifiedCount > 0 ? 'developing' : 'exploring';
    const daysAgoStr = r.lastPracticed
      ? `${Math.floor((Date.now() - new Date(r.lastPracticed)) / 86400000)}d ago`
      : 'never';
    console.log(`  ${r._id.padEnd(22)} ${level.padEnd(12)} ${r.totalSessions} sessions  last: ${daysAgoStr}`);
  }
  console.log('\n── Confusion pairs ──────────────────────────────────────');
  for (const c of confusionPairs) {
    console.log(`  ${c._id.raga} ↔ ${c._id.confusedWith}  ×${c.count}`);
  }
  console.log('\nSeed complete. Deploy or refresh to see the demo state.');
} finally {
  await client.close();
}
