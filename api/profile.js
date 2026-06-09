import { MongoClient } from 'mongodb';
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

export default async function handler(req, res) {
  applyApiSecurity(req, res, ['GET', 'POST', 'OPTIONS']);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (rejectDisallowedOrigin(req, res)) return;
  if (!MONGODB_URI) return res.status(500).json({ error: 'MongoDB not configured.' });

  try {
    const userId = await requireVerifiedUserId(req, res);
    if (!userId) return;
    const db = await getDb();

    if (req.method === 'GET') {
      if (!await enforceRateLimit(req, res, {
        name: 'profile-get',
        userId,
        limit: 30,
        windowMs: 60_000,
        extraLimits: [
          { label: 'daily', limit: 200, windowMs: 24 * 60 * 60 * 1000 },
        ],
      })) return;
      const profile = await db.collection('profiles').findOne({ userId }, { projection: { _id: 0 } });
      return res.status(200).json({ profile: profile || null });
    }

    if (req.method === 'POST') {
      if (!await enforceRateLimit(req, res, {
        name: 'profile-post',
        userId,
        limit: 20,
        windowMs: 60_000,
        extraLimits: [
          { label: 'daily', limit: 80, windowMs: 24 * 60 * 60 * 1000 },
        ],
      })) return;
      const { userId: _ignoredUserId, ...profileData } = req.body || {};
      await db.collection('profiles').updateOne(
        { userId },
        { $set: { userId, ...profileData, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
