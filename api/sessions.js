import { MongoClient } from 'mongodb';
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
import { requireVerifiedUserId } from './_auth.js';
import { enforceRateLimit } from './_rateLimit.js';
import { applyApiSecurity, rejectDisallowedOrigin } from './_security.js';

const MONGODB_URI = process.env.MONGODB_URI;

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
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
      refreshToken: creds.refresh_token,
    });
  }
  return new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
}

async function writeSessionViaMCP(userId, sessionData) {
  const agentEngineResource = process.env.AGENT_ENGINE_RESOURCE;
  if (!agentEngineResource) return false;
  try {
    const client = getAuthClient();
    const { token } = await client.getAccessToken();
    const { tool = '', raga = '', durationMinutes = 0, notes = '' } = sessionData;

    const sessionRes = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/${agentEngineResource}/sessions`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
        signal: AbortSignal.timeout(8000),
      }
    );
    let sessionData2 = {};
    try { sessionData2 = await sessionRes.json(); } catch {}
    const sessionId = sessionData2.name?.match(/\/sessions\/(\d+)/)?.[1] || userId;

    await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/${agentEngineResource}:streamQuery`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            message: `Record this practice session in the 'sessions' collection of the 'alapana' database using MongoDB insertOne: { userId: "${userId}", tool: "${tool}", raga: "${raga}", durationMinutes: ${durationMinutes}, notes: "${notes}", timestamp: current UTC time }.`,
            user_id: userId,
            session_id: sessionId,
          },
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  applyApiSecurity(req, res, ['GET', 'POST', 'OPTIONS']);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (rejectDisallowedOrigin(req, res)) return;

  if (!MONGODB_URI) return res.status(500).json({ error: 'MongoDB not configured.' });

  try {
    const userId = await requireVerifiedUserId(req, res);
    if (!userId) return;

    if (req.method === 'GET') {
      if (!await enforceRateLimit(req, res, {
        name: 'sessions-get',
        userId,
        limit: 60,
        windowMs: 60_000,
        extraLimits: [
          { label: 'daily', limit: 600, windowMs: 24 * 60 * 60 * 1000 },
        ],
      })) return;
      const db = await getDb();
      const recent = await db.collection('sessions')
        .find({ userId })
        .sort({ timestamp: -1 })
        .limit(15)
        .toArray();
      return res.status(200).json({ sessions: recent });
    }

    if (req.method === 'POST') {
      if (!await enforceRateLimit(req, res, {
        name: 'sessions-post',
        userId,
        limit: 90,
        windowMs: 60_000,
        extraLimits: [
          { label: 'daily', limit: 1000, windowMs: 24 * 60 * 60 * 1000 },
        ],
      })) return;
      const {
        tool, raga, durationMinutes, notes,
        outcome, confidence, confusedWith, swarasFocused,
      } = req.body || {};
      const sessionData = {
        tool: tool || '',
        raga: raga || '',
        durationMinutes: durationMinutes || 0,
        notes: notes || '',
        ...(outcome    && { outcome }),
        ...(confidence && { confidence }),
        ...(confusedWith && { confusedWith }),
        ...(Array.isArray(swarasFocused) && swarasFocused.length > 0 ? { swarasFocused } : {}),
      };

      // Rich identification sessions (with outcome data) skip MCP — write directly so all
      // fields are stored. Plain navigation sessions use the MCP path as usual.
      let wroteViaMCP = false;
      if (!outcome) {
        wroteViaMCP = await writeSessionViaMCP(userId, sessionData);
      }

      if (!wroteViaMCP) {
        const db = await getDb();
        await db.collection('sessions').insertOne({ userId, ...sessionData, timestamp: new Date() });
      }

      return res.status(201).json({ ok: true, via: wroteViaMCP ? 'agent-mcp' : 'direct' });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
