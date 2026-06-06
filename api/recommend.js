/* global process, Buffer */
/**
 * Agent-driven practice recommendation.
 *
 * Fetches real learner data from MongoDB, passes it to Gemini 2.5 Flash
 * with a structured-output contract, and returns a JSON recommendation
 * that the workspace renders and routes from directly.
 *
 * The agent decides priority, names the specific exercise, chooses the
 * destination surface, and produces a session plan — none of that logic
 * lives in the UI anymore.
 */
import { MongoClient } from 'mongodb';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import { requireVerifiedUserId } from './_auth.js';
import { enforceRateLimit } from './_rateLimit.js';
import { applyApiSecurity, rejectDisallowedOrigin } from './_security.js';

const MONGODB_URI   = process.env.MONGODB_URI;
const GCP_PROJECT   = process.env.GOOGLE_CLOUD_PROJECT  || 'project-24a53985-305d-4031-ae8';
const GCP_LOCATION  = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const GEMINI_MODEL  = 'gemini-2.5-flash';
const EVALUATED_TOOLS = ['tutor', 'singback', 'lesson-feedback'];

let cachedClient = null;
async function getDb() {
  if (cachedClient && !cachedClient.topology?.isConnected()) cachedClient = null;
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('alapana');
}

function getAuthClient() {
  const b64 = process.env.GOOGLE_CREDENTIALS_B64;
  if (b64) {
    const creds = JSON.parse(Buffer.from(b64, 'base64').toString());
    return new UserRefreshClient({
      clientId:     creds.client_id,
      clientSecret: creds.client_secret,
      refreshToken: creds.refresh_token,
    });
  }
  return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
}

function computeMastery({ totalSessions, identifiedCount }) {
  const r = totalSessions > 0 ? identifiedCount / totalSessions : 0;
  if (totalSessions >= 8 && r >= 0.7) return 'strong';
  if (totalSessions >= 4 && r >= 0.5) return 'stable';
  if (totalSessions >= 2 || identifiedCount > 0) return 'developing';
  return 'exploring';
}

async function fetchLearnerData(db, userId) {
  const [ragaStatsRaw, confusionPairsRaw] = await Promise.all([
    db.collection('sessions').aggregate([
      { $match: { userId, raga: { $exists: true, $nin: ['', null] } } },
      { $group: {
          _id: '$raga',
          totalSessions:  { $sum: 1 },
          identifiedCount: { $sum: { $cond: [{ $in: ['$outcome', ['identified', 'likely']] }, 1, 0] } },
          ambiguousCount:  { $sum: { $cond: [{ $eq: ['$outcome', 'ambiguous'] }, 1, 0] } },
          lastPracticed:  { $max: '$timestamp' },
      }},
      { $sort: { totalSessions: -1 } },
      { $limit: 10 },
    ]).toArray(),

    db.collection('sessions').aggregate([
      { $match: {
          userId,
          tool: { $in: EVALUATED_TOOLS },
          confusedWith: { $exists: true, $nin: ['', null] },
          raga: { $exists: true, $nin: ['', null] },
      }},
      { $group: {
          _id: { raga: '$raga', confusedWith: '$confusedWith' },
          count: { $sum: 1 },
          lastOccurred: { $max: '$timestamp' },
      }},
      { $sort: { count: -1 } },
      { $limit: 4 },
    ]).toArray(),
  ]);

  const ragaStats = ragaStatsRaw.map(r => ({
    raga: r._id,
    totalSessions: r.totalSessions,
    identifiedCount: r.identifiedCount,
    ambiguousCount: r.ambiguousCount,
    masteryLevel: computeMastery(r),
    daysSincePractice: r.lastPracticed
      ? Math.floor((Date.now() - new Date(r.lastPracticed)) / 86400000)
      : null,
  }));

  const confusionPairs = confusionPairsRaw.map(c => ({
    raga: c._id.raga,
    confusedWith: c._id.confusedWith,
    count: c.count,
    daysSince: c.lastOccurred
      ? Math.floor((Date.now() - new Date(c.lastOccurred)) / 86400000)
      : null,
  }));

  return { ragaStats, confusionPairs };
}

function buildLearnerContext({ ragaStats, confusionPairs }) {
  const lines = [];

  if (confusionPairs.length > 0) {
    lines.push('CONFUSION PAIRS (from evaluated Gurukul practice sessions):');
    for (const c of confusionPairs) {
      lines.push(`  ${c.raga} ↔ ${c.confusedWith}: ${c.count} session${c.count !== 1 ? 's' : ''}, last ${c.daysSince !== null ? c.daysSince + 'd ago' : 'unknown'}`);
    }
  } else {
    lines.push('CONFUSION PAIRS: none recorded from evaluated practice yet');
  }

  if (ragaStats.length > 0) {
    lines.push('RAGA PRACTICE HISTORY:');
    for (const r of ragaStats) {
      const staleFlag = r.daysSincePractice !== null && r.daysSincePractice > 3
        && (r.masteryLevel === 'developing' || r.masteryLevel === 'exploring')
        ? ` [STALE: ${r.daysSincePractice}d without practice]` : '';
      lines.push(`  ${r.raga}: ${r.totalSessions} total sessions, ${r.identifiedCount} accurate, ${r.ambiguousCount} ambiguous, ${r.masteryLevel}${staleFlag}, last ${r.daysSincePractice !== null ? r.daysSincePractice + 'd ago' : 'unknown'}`);
    }
  } else {
    lines.push('RAGA PRACTICE HISTORY: no sessions recorded yet');
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are a Carnatic practice prescriber with access to a learner's real session history. Your job is to decide what they should practice right now and route them to the exact surface.

Respond with ONLY valid JSON matching this exact schema — no other text, no markdown:

{
  "priority": "confusion_pair" | "stale_raga" | "advance_raga" | "foundation",
  "reason": "<one specific sentence citing actual raga names, session counts, or days from the data>",
  "exercise": "<exact exercise: what phrase to sing, how many repetitions, what note to hold>",
  "sessionPlan": [
    { "minutes": <number>, "activity": "<specific activity with tool name>" },
    { "minutes": <number>, "activity": "<specific activity with tool name>" },
    { "minutes": <number>, "activity": "<specific activity with tool name>" }
  ],
  "destination": {
    "view": "compare" | "tutor" | "library" | "shruthi",
    "ragaA": "<raga name or null>",
    "ragaB": "<raga name or null>",
    "raga": "<raga name or null>"
  },
  "followup": {
    "view": "tutor" | "viveka",
    "raga": "<raga name or null>"
  }
}

ROUTING RULES:
- confusion_pair → destination.view = "compare", ragaA = confused raga, ragaB = confusedWith
- stale_raga → destination.view = "tutor", raga = the stale raga name
- advance_raga → destination.view = "tutor", raga = the stable raga name
- foundation → destination.view = "shruthi", raga = null

SESSION PLAN RULES:
- Exactly 3 steps
- Minutes sum to 15
- Step 1: the primary activity at the destination surface
- Step 2: the core practice exercise
- Step 3: verification or reinforcement

CONTENT RULES:
- reason must name specific ragas and numbers from the data — never generic
- exercise must name the exact phrase to sing (e.g. "Pa-Dha-Ni-Sa") and what to notice
- Never say "consider", "you might", or "try" — prescribe directly
- Use Carnatic tool names: Raga Kosha comparison, Gurukul Raga Practice, Shruthi drone`;

async function callGemini(learnerContext) {
  const client = getAuthClient();
  const { token } = await client.getAccessToken();

  const res = await fetch(
    `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [{ text: `LEARNER DATA:\n${learnerContext}\n\nGenerate the recommendation JSON now.` }],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 600,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(12000),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini ${res.status}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No content from Gemini');
  return JSON.parse(text);
}

const FOUNDATION_REC = {
  priority: 'foundation',
  reason: 'No practice sessions recorded yet — the first priority is locking in your Sa.',
  exercise: 'Open Shruthi, set a comfortable Sa, and hum along with the drone for 5 minutes until your voice centres on it.',
  sessionPlan: [
    { minutes: 5, activity: 'Shruthi: hum Sa against the drone until your voice locks on' },
    { minutes: 7, activity: 'Gurukul Curriculum → Foundations → Lesson 1' },
    { minutes: 3, activity: 'Gurukul Raga Practice: sing Mayamalavagowla arohanam slowly' },
  ],
  destination: { view: 'shruthi', ragaA: null, ragaB: null, raga: null },
  followup:    { view: 'tutor', raga: null },
};

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
      name: 'recommend',
      userId,
      limit: 10,
      windowMs: 60_000,
      extraLimits: [{ label: 'daily', limit: 30, windowMs: 24 * 60 * 60 * 1000 }],
    })) return;

    const db = await getDb();
    const learnerData = await fetchLearnerData(db, userId);

    const hasData = learnerData.ragaStats.length > 0 || learnerData.confusionPairs.length > 0;
    if (!hasData) return res.status(200).json(FOUNDATION_REC);

    const learnerContext = buildLearnerContext(learnerData);
    const recommendation = await callGemini(learnerContext);

    // Validate required fields before returning
    if (!recommendation.priority || !recommendation.destination?.view) {
      return res.status(200).json(FOUNDATION_REC);
    }

    return res.status(200).json(recommendation);
  } catch (err) {
    // Non-fatal: return foundation recommendation so workspace always has something to show
    console.error('recommend:', err.message);
    return res.status(200).json({ ...FOUNDATION_REC, _fallback: true });
  }
}
