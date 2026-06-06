/* global process, Buffer */
import { MongoClient } from 'mongodb';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
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

async function buildLearnerModelSummary(db, userId) {
  try {
    const [ragaStatsRaw, confusionPairsRaw] = await Promise.all([
      db.collection('sessions').aggregate([
        { $match: { userId, raga: { $exists: true, $nin: ['', null] } } },
        {
          $group: {
            _id: '$raga',
            totalSessions: { $sum: 1 },
            identifiedCount: {
              $sum: { $cond: [{ $in: ['$outcome', ['identified', 'likely']] }, 1, 0] },
            },
          },
        },
        { $sort: { totalSessions: -1 } },
        { $limit: 10 },
      ]).toArray(),

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
          },
        },
        { $sort: { count: -1 } },
        { $limit: 4 },
      ]).toArray(),
    ]);

    const ragaStats = ragaStatsRaw.map(r => ({
      raga: r._id,
      totalSessions: r.totalSessions,
      identifiedCount: r.identifiedCount,
      masteryLevel: computeMasteryLevel(r),
    }));

    const parts = [];
    const strong = ragaStats.filter(r => r.masteryLevel === 'strong' || r.masteryLevel === 'stable');
    const developing = ragaStats.filter(r => r.masteryLevel === 'exploring' || r.masteryLevel === 'developing');
    if (strong.length) parts.push(`Strong ragas: ${strong.map(r => `${r.raga}(${r.masteryLevel})`).join(', ')}`);
    if (developing.length) parts.push(`Developing: ${developing.map(r => `${r.raga}(${r.totalSessions} sessions)`).join(', ')}`);
    if (confusionPairsRaw.length) {
      parts.push(
        `Recurring confusions: ${confusionPairsRaw.map(c => `${c._id.raga}↔${c._id.confusedWith}(${c.count}x)`).join(', ')}`
      );
    }
    return parts.length ? `Learner model: ${parts.join(' | ')}` : '';
  } catch {
    return '';
  }
}

/**
 * Pre-compute a concrete prescription from the learner data so the agent
 * never has to derive it from raw numbers — it just presents it clearly.
 * Each case names the specific raga(s), count, days, exercise, tool, and duration.
 */
function buildPrescription(ragaStats, confusionPairsRaw, totalApproxSessions) {
  const lines = [];

  // Case 1: Brand-new user — no session history at all
  if (totalApproxSessions === 0) {
    lines.push('PRESCRIBED NEXT EXERCISE (no session history — first session):');
    lines.push('  Pattern: No session history recorded yet.');
    lines.push('  Why: Locking in Sa alignment is the single most important first step — every identification and practice exercise depends on it.');
    lines.push('  Exercise: Open Shruthi, pick a comfortable Sa (try C4 or D4), and hum a sustained "Sa" until your voice locks onto the drone. Then sing Sa-Ri-Ga-Ma-Pa-Dha-Ni-Sa slowly five times with it running.');
    lines.push('  Tool: Open Shruthi first. Then Gurukul → Curriculum → Foundations → Lesson 1.');
    lines.push('  Duration: 15 minutes.');
    return lines.join('\n');
  }

  // Case 2: Active confusion pair — highest diagnostic value
  if (confusionPairsRaw.length > 0) {
    const top = confusionPairsRaw[0];
    const raga1 = top._id.raga;
    const raga2 = top._id.confusedWith;
    const count = top.count;
    lines.push('PRESCRIBED NEXT EXERCISE (top confusion pattern from session history):');
    lines.push(`  Pattern: ${raga1} and ${raga2} have been confused ${count} time${count !== 1 ? 's' : ''} in recorded sessions.`);
    lines.push(`  Why: Confusion at the identification stage means the ear has not yet isolated the diagnostic note that separates them — usually a characteristic Ni, Ga, or phrase ending. Targeted side-by-side comparison is the fastest fix.`);
    lines.push(`  Exercise: First open Raga Kosha and compare ${raga1} and ${raga2} side by side — identify the one or two notes that differ. Then open Gurukul → Raga Practice, set the drone, and sing the upper tetrachord (Pa-Dha-Ni-Sa) of each raga back to back three times. Hold the differing note each time and name it aloud.`);
    lines.push(`  Tool: Start with Raga Kosha comparison, then Gurukul → Raga Practice to drill. After drilling, use Dhwani to verify your ear is now distinguishing them correctly.`);
    lines.push(`  Duration: 10–15 minutes.`);
    // Surface second confusion pair if present
    if (confusionPairsRaw.length > 1) {
      const second = confusionPairsRaw[1];
      lines.push(`  ALSO NOTED: ${second._id.raga} and ${second._id.confusedWith} confused ${second.count} time${second.count !== 1 ? 's' : ''} — address after the top pair is resolved.`);
    }
    return lines.join('\n');
  }

  // Case 3: Stale developing raga — gap is widening
  const stale = ragaStats.find(r =>
    (r.masteryLevel === 'developing' || r.masteryLevel === 'exploring') &&
    r.lastPracticed &&
    Date.now() - new Date(r.lastPracticed).getTime() > 4 * 24 * 60 * 60 * 1000
  );
  if (stale) {
    const daysSince = Math.floor((Date.now() - new Date(stale.lastPracticed).getTime()) / 86400000);
    lines.push('PRESCRIBED NEXT EXERCISE (stale developing raga):');
    lines.push(`  Pattern: ${stale.raga} has ${stale.totalSessions} session${stale.totalSessions !== 1 ? 's' : ''} and is still at ${stale.masteryLevel} level — last practiced ${daysSince} day${daysSince !== 1 ? 's' : ''} ago.`);
    lines.push(`  Why: A ${daysSince}-day gap at the ${stale.masteryLevel} stage means the scale shape has not reached muscle memory. The window to consolidate it is closing.`);
    lines.push(`  Exercise: Sing Sarali Varisai pattern 1 in ${stale.raga} at a slow, deliberate tempo — one note per beat with the drone running. Repeat 5 times, then sing the full arohanam-avarohanam 5 times.`);
    lines.push(`  Tool: Open Shruthi (set Sa), then Gurukul → Curriculum → Sarali Varisai. For live pitch feedback, use Gurukul → Raga Practice tab with ${stale.raga} selected.`);
    lines.push(`  Duration: 15 minutes.`);
    return lines.join('\n');
  }

  // Case 4: A stable raga that can be pushed further
  const ready = ragaStats.find(r => r.masteryLevel === 'stable' && r.totalSessions >= 4);
  if (ready) {
    lines.push('PRESCRIBED NEXT EXERCISE (advance stable raga):');
    lines.push(`  Pattern: ${ready.raga} is at stable level with ${ready.totalSessions} sessions — the scale is settled but depth is not yet strong.`);
    lines.push(`  Why: Moving a stable raga to strong requires practicing the characteristic gamakam phrases and vakra movements, not just the straight scale.`);
    lines.push(`  Exercise: Pick one characteristic 3–4 swara phrase of ${ready.raga} that includes a gamakam or vakra movement. Sing it with the drone. Use Raga Practice AI feedback to check pitch accuracy and ornament quality.`);
    lines.push(`  Tool: Open Gurukul → Raga Practice tab. Set raga to ${ready.raga} and tala to Adi.`);
    lines.push(`  Duration: 15–20 minutes.`);
    return lines.join('\n');
  }

  // Case 5: Only exploring-stage ragas — early practice history
  const exploring = ragaStats.find(r => r.masteryLevel === 'exploring');
  if (exploring) {
    lines.push('PRESCRIBED NEXT EXERCISE (early-stage raga):');
    lines.push(`  Pattern: ${exploring.raga} has ${exploring.totalSessions} session${exploring.totalSessions !== 1 ? 's' : ''} — still in the exploring stage.`);
    lines.push(`  Why: At the exploring stage, the priority is internalizing the scale shape before attempting identification or ornamentation.`);
    lines.push(`  Exercise: Look up ${exploring.raga} in Raga Kosha first — check the arohanam, avarohanam, and characteristic phrases. Then sing the scale 5 times against the drone, pausing on the characteristic Ni or Ga for two counts each time.`);
    lines.push(`  Tool: Open Raga Kosha → search ${exploring.raga}. Then Shruthi + Gurukul → Raga Practice tab.`);
    lines.push(`  Duration: 15 minutes.`);
    return lines.join('\n');
  }

  // Fallback: has sessions but no specific gap detected
  const mostPracticed = ragaStats[0];
  lines.push('PRESCRIBED NEXT EXERCISE (consistent practice — no critical gap):');
  lines.push(`  Pattern: ${ragaStats.length} raga${ragaStats.length !== 1 ? 's' : ''} in history, ${totalApproxSessions} total sessions — no critical confusion or stale gap detected right now.`);
  lines.push(`  Why: Maintaining consistency matters more than fixing a specific gap when none is urgent.`);
  lines.push(`  Exercise: ${mostPracticed ? `Sing Sarali Varisai patterns 1–3 in ${mostPracticed.raga}` : 'Sing Sarali Varisai patterns 1–3 in your most comfortable raga'} with the drone. Focus on breath support and not rushing.`);
  lines.push(`  Tool: Open Shruthi (set Sa), then Gurukul → Curriculum → Sarali Varisai.`);
  lines.push(`  Duration: 15 minutes.`);
  return lines.join('\n');
}

async function buildUserContext(userId, appMode, sadhanaCompleted) {
  if (!MONGODB_URI) return '';
  try {
    const db = await getDb();

    // Run profile + learner model queries in parallel
    const [profile, ragaStatsRaw, confusionPairsRaw] = await Promise.all([
      db.collection('profiles').findOne({ userId }, { projection: { _id: 0 } }),
      db.collection('sessions').aggregate([
        { $match: { userId, raga: { $exists: true, $nin: ['', null] } } },
        {
          $group: {
            _id: '$raga',
            totalSessions: { $sum: 1 },
            identifiedCount: {
              $sum: { $cond: [{ $in: ['$outcome', ['identified', 'likely']] }, 1, 0] },
            },
            lastPracticed: { $max: '$timestamp' },
          },
        },
        { $sort: { totalSessions: -1 } },
        { $limit: 8 },
      ]).toArray(),
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
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]).toArray(),
    ]);

    const sessionFilter = profile?.updatedAt
      ? { userId, timestamp: { $gt: profile.updatedAt } }
      : { userId };
    const recentSessions = await db.collection('sessions')
      .find(sessionFilter)
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    const ragaStats = ragaStatsRaw.map(r => ({
      raga: r._id,
      totalSessions: r.totalSessions,
      identifiedCount: r.identifiedCount,
      lastPracticed: r.lastPracticed,
      masteryLevel: computeMasteryLevel(r),
    }));

    // Build an explicit coaching brief rather than a terse metadata block.
    // The agent must use these facts when answering questions about progress,
    // weaknesses, and next steps — not give generic tool suggestions.
    const lines = [];

    // Student profile
    if (profile) {
      lines.push(`STUDENT PROFILE: experience=${profile.experience || 'unknown'}, goal=${profile.goal || 'unknown'}, path=${profile.branch || 'unknown'}, app_mode=${appMode || 'musician'}`);
    } else {
      lines.push(`STUDENT PROFILE: app_mode=${appMode || 'musician'}`);
    }

    // Confusion patterns — this is what answers "what am I getting wrong"
    if (confusionPairsRaw.length > 0) {
      lines.push('');
      lines.push('RECURRING CONFUSION PATTERNS (from MongoDB session history — use these when asked what the student gets wrong):');
      confusionPairsRaw.forEach(c => {
        lines.push(`  • ${c._id.raga} confused with ${c._id.confusedWith}: ${c.count} time${c.count !== 1 ? 's' : ''} recorded`);
      });
    } else {
      lines.push('');
      lines.push('CONFUSION PATTERNS: none recorded yet — the student has not completed enough evaluated practice sessions to establish recurring raga mix-ups.');
    }

    // Raga progress
    if (ragaStats.length > 0) {
      lines.push('');
      lines.push('RAGA PROGRESS (from MongoDB):');
      ragaStats.forEach(r => {
        const daysSince = r.lastPracticed
          ? Math.floor((Date.now() - new Date(r.lastPracticed).getTime()) / 86400000)
          : null;
        const recency = daysSince === null ? '' : daysSince === 0 ? ', practiced today' : `, last practiced ${daysSince}d ago`;
        lines.push(`  • ${r.raga}: ${r.masteryLevel} (${r.totalSessions} sessions${recency})`);
      });
    } else {
      lines.push('');
      lines.push('RAGA PROGRESS: no raga-specific history yet.');
    }

    // Recent activity
    if (recentSessions.length > 0) {
      const recent = recentSessions
        .map(s => [s.tool, s.raga].filter(Boolean).join('/'))
        .filter(Boolean)
        .join(', ');
      if (recent) lines.push(`\nRECENT ACTIVITY: ${recent}`);
    }

    if (sadhanaCompleted?.length) {
      lines.push(`SADHANA COMPLETED TODAY: ${sadhanaCompleted.join(', ')}`);
    }

    // Pre-computed prescription — agent must deliver this rather than derive from raw numbers
    const totalApproxSessions = ragaStats.reduce((sum, r) => sum + r.totalSessions, 0);
    lines.push('');
    lines.push(buildPrescription(ragaStats, confusionPairsRaw, totalApproxSessions));
    lines.push('');
    lines.push('DELIVERY RULE: When the user asks what to practice, what they keep getting wrong, or to plan a session — deliver the PRESCRIBED NEXT EXERCISE above as direct sentences: state the pattern (with the specific raga name and number), explain why it matters, name the exercise, name the exact tool and tab, and give the duration. Do not say "consider" or "you might want to". Say "Practice X for Y minutes" or "Spend X minutes on Y".');

    return lines.join('\n') + '\n\n';
  } catch {
    return '';
  }
}

function buildConversationContext(history = []) {
  if (!Array.isArray(history) || !history.length) return '';
  const normalized = history
    .filter((entry) => entry && typeof entry.content === 'string' && entry.content.trim())
    .slice(-8)
    .map((entry) => {
      const role = entry.role === 'assistant' ? 'Coach' : 'User';
      const content = entry.content.replace(/\s+/g, ' ').trim();
      return `${role}: ${content}`;
    });
  if (!normalized.length) return '';
  return `Recent conversation:\n${normalized.join('\n')}\n\n`;
}

function getAuthClient() {
  const b64 = process.env.GOOGLE_CREDENTIALS_B64;
  if (b64) {
    const creds = JSON.parse(Buffer.from(b64, 'base64').toString());
    return new UserRefreshClient({
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
      refreshToken: creds.refresh_token,
    });
  }
  return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
}

// The agent's actual instruction lives in agent/agent.py (SYSTEM_PROMPT, line 8).
// That file is deployed to Vertex AI Agent Engine and controls all agent behavior.
// This API handler only routes messages and pre-fetches MongoDB context for latency.

export default async function handler(req, res) {
  applyApiSecurity(req, res, ['POST', 'OPTIONS']);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (rejectDisallowedOrigin(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireVerifiedUserId(req, res);
  if (!userId) return;
  if (!await enforceRateLimit(req, res, {
    name: 'coach',
    userId,
    limit: 24,
    windowMs: 60_000,
    extraLimits: [
      { label: 'daily', limit: 200, windowMs: 24 * 60 * 60 * 1000 },
    ],
  })) return;
  const { message, history = [], appMode, sadhanaCompleted } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'Invalid message.' });
  }

  const agentEngineResource = process.env.AGENT_ENGINE_RESOURCE;
  if (!agentEngineResource) {
    return res.status(503).json({
      error: 'Agent Engine not configured. Deploy the agent first: python agent/deploy_to_agent_engine.py, then set AGENT_ENGINE_RESOURCE.',
    });
  }

  try {
    const userContext = await buildUserContext(userId, appMode, sadhanaCompleted);
    const conversationContext = buildConversationContext(history);
    const enrichedMessage = `${userContext || ''}${conversationContext || ''}Current user message: ${message}`.trim();

    const client = getAuthClient();
    const { token } = await client.getAccessToken();

    // Create a session keyed by userId so the ADK agent can maintain conversation state.
    // Note: user_id uses snake_case as required by the Vertex AI Agent Engine API.
    const sessionRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/${agentEngineResource}/sessions`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      }
    );
    const sessionRawText = await sessionRes.text();
    let sessionData = {};
    try { sessionData = JSON.parse(sessionRawText); } catch {}
    // Session creation returns a long-running operation — extract session ID from
    // the middle of the path (…/sessions/{id}/operations/{opId}), not the end.
    const sessionId = sessionData.name?.match(/\/sessions\/(\d+)/)?.[1] || userId;

    const agentRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/${agentEngineResource}:streamQuery`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            message:    enrichedMessage,
            user_id:    userId,
            session_id: sessionId,
          },
        }),
      }
    );

    const rawBody = await agentRes.text();

    if (!agentRes.ok) {
      return res.status(500).json({ error: `Agent Engine error: ${rawBody}` });
    }

    // streamQuery returns NDJSON — each line is an ADK event. Scan for the
    // final model text, which sits in content.parts[0].text of the last
    // non-error event whose finish_reason is STOP (or similar).
    let reply = null;
    for (const line of rawBody.split('\n').reverse()) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        if (event?.error_code) continue; // skip error events, keep looking
        const text = event?.content?.parts?.[0]?.text
                  || event?.output
                  || event?.response?.parts?.[0]?.text
                  || (event?.actions?.at(-1))?.response?.parts?.[0]?.text;
        if (text) { reply = text; break; }
      } catch { /* skip malformed lines */ }
    }

    if (!reply) return res.status(500).json({ error: 'Empty response from Agent Engine.', _raw: rawBody.slice(0, 2000) });
    return res.status(200).json({ reply, via: 'agent-engine' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Coach request failed.' });
  }
}
