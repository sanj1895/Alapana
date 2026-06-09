import { MongoClient } from 'mongodb';
import { requireVerifiedUserId } from './_auth.js';
import { enforceRateLimit } from './_rateLimit.js';
import { applyApiSecurity, rejectDisallowedOrigin } from './_security.js';

const MONGODB_URI = process.env.MONGODB_URI;
let cachedClient = null;
const EVALUATED_CONFUSION_TOOLS = ['tutor', 'singback', 'lesson-feedback'];

async function getDb() {
  if (cachedClient && !cachedClient.topology?.isConnected()) cachedClient = null;
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('alapana');
}

function computeMasteryLevel({ totalSessions, identifiedCount }) {
  const successRate = totalSessions > 0 ? identifiedCount / totalSessions : 0;
  if (totalSessions >= 8 && successRate >= 0.7) return 'strong';
  if (totalSessions >= 4 && successRate >= 0.5) return 'stable';
  if (totalSessions >= 2 || identifiedCount > 0) return 'developing';
  return 'exploring';
}

export default async function handler(req, res) {
  applyApiSecurity(req, res, ['GET', 'OPTIONS']);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (rejectDisallowedOrigin(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!MONGODB_URI) return res.status(500).json({ error: 'MongoDB not configured.' });

  try {
    const userId = await requireVerifiedUserId(req, res);
    if (!userId) return;
    if (!await enforceRateLimit(req, res, {
      name: 'learner-model',
      userId,
      limit: 24,
      windowMs: 60_000,
      extraLimits: [
        { label: 'daily', limit: 200, windowMs: 24 * 60 * 60 * 1000 },
      ],
    })) return;
    const db = await getDb();

    const [ragaStatsRaw, confusionPairsRaw, timelineRaw, totalSessions] = await Promise.all([
      // Per-raga aggregate: sessions, outcomes, confidence, last practiced
      db.collection('sessions').aggregate([
        { $match: { userId, raga: { $exists: true, $nin: ['', null] } } },
        {
          $group: {
            _id: '$raga',
            totalSessions: { $sum: 1 },
            identifiedCount: {
              $sum: { $cond: [{ $in: ['$outcome', ['identified', 'likely']] }, 1, 0] },
            },
            confusedCount: {
              $sum: { $cond: [{ $eq: ['$outcome', 'ambiguous'] }, 1, 0] },
            },
            highConfCount: {
              $sum: { $cond: [{ $eq: ['$confidence', 'high'] }, 1, 0] },
            },
            lastPracticed: { $max: '$timestamp' },
            tools: { $addToSet: '$tool' },
          },
        },
        { $sort: { totalSessions: -1 } },
      ]).toArray(),

      // Confusion pairs: only from evaluated practice flows, never from Viveka classifier uncertainty
      db.collection('sessions').aggregate([
        {
          $match: {
            userId,
            tool: { $in: EVALUATED_CONFUSION_TOOLS },
            confusedWith: { $exists: true, $nin: ['', null] },
            raga: { $exists: true, $nin: ['', null] },
          },
        },
        {
          $group: {
            _id: { raga: '$raga', confusedWith: '$confusedWith' },
            count: { $sum: 1 },
            lastOccurred: { $max: '$timestamp' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]).toArray(),

      // Practice timeline: last 21 days — only evaluated sessions (raga present)
      db.collection('sessions').aggregate([
        {
          $match: {
            userId,
            raga: { $exists: true, $nin: ['', null] },
            timestamp: { $gte: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 },
            ragas: { $addToSet: '$raga' },
            tools: { $addToSet: '$tool' },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),

      db.collection('sessions').countDocuments({ userId, raga: { $exists: true, $nin: ['', null] } }),
    ]);

    const ragaStats = ragaStatsRaw.map(r => ({
      raga: r._id,
      totalSessions: r.totalSessions,
      identifiedCount: r.identifiedCount,
      confusedCount: r.confusedCount,
      highConfCount: r.highConfCount,
      lastPracticed: r.lastPracticed,
      tools: (r.tools || []).filter(Boolean),
      masteryLevel: computeMasteryLevel(r),
    }));

    const confusionPairs = confusionPairsRaw.map(c => ({
      raga: c._id.raga,
      confusedWith: c._id.confusedWith,
      count: c.count,
      lastOccurred: c.lastOccurred,
    }));

    const practiceTimeline = timelineRaw.map(t => ({
      date: t._id,
      count: t.count,
      ragas: (t.ragas || []).filter(Boolean),
      tools: (t.tools || []).filter(Boolean),
    }));

    // Build a concise text summary for the coach's context injection
    const strongRagas = ragaStats.filter(r => r.masteryLevel === 'strong' || r.masteryLevel === 'stable');
    const weakRagas = ragaStats.filter(r => r.masteryLevel === 'exploring' || r.masteryLevel === 'developing');
    const topConfusions = confusionPairs.slice(0, 3);
    const activeDays = practiceTimeline.filter(t => t.count > 0).length;

    const summaryParts = [];
    if (strongRagas.length) {
      summaryParts.push(
        `Strong/Stable ragas: ${strongRagas.map(r => `${r.raga}(${r.totalSessions}sess,${r.masteryLevel})`).join(', ')}`
      );
    }
    if (weakRagas.length) {
      summaryParts.push(
        `Developing ragas: ${weakRagas.map(r => `${r.raga}(${r.totalSessions}sess)`).join(', ')}`
      );
    }
    if (topConfusions.length) {
      summaryParts.push(
        `Confusion pairs: ${topConfusions.map(c => `${c.raga}↔${c.confusedWith}(${c.count}x)`).join(', ')}`
      );
    }
    if (activeDays > 0) {
      summaryParts.push(`Active days (last 21): ${activeDays}`);
    }
    if (!ragaStats.length) {
      summaryParts.push('No raga-specific practice history yet');
    }

    return res.status(200).json({
      ragaStats,
      confusionPairs,
      practiceTimeline,
      totalSessions,
      activeDays,
      coachSummary: summaryParts.join(' | '),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
