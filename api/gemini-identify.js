/**
 * Gemini-powered raga identification endpoint.
 *
 * Gemini-powered endpoint for raga identification.
 *
 * Accepts an OpenAI-compatible request body so the frontend transport stays
 * simple and consistent.
 *
 * Uses Gemini 2.5 Flash via Vertex AI with responseMimeType=application/json
 * to guarantee structured output without a parsing wrapper.
 */
/* global process */
import { GoogleAuth, UserRefreshClient } from 'google-auth-library';
//import { requireVerifiedUserId } from './_auth.js';
import { enforceRateLimit } from './_rateLimit.js';
import { applyApiSecurity, rejectDisallowedOrigin } from './_security.js';

const GCP_PROJECT  = process.env.GOOGLE_CLOUD_PROJECT  || 'project-24a53985-305d-4031-ae8';
const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_BODY_BYTES          = 80_000;
const MAX_TOTAL_MESSAGE_CHARS = 50_000;

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

export default async function handler(req, res) {
  applyApiSecurity(req, res, ['POST', 'OPTIONS']);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (rejectDisallowedOrigin(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // AI Guru should work for public practice users without requiring login.
// Keep rate limiting, but key it by IP instead of authenticated user id.
  const userId =
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
  req.socket?.remoteAddress ||
  'anonymous';

if (!await enforceRateLimit(req, res, {
  name: 'gemini-identify',
  userId,
  limit: 20,
  windowMs: 60_000,
  extraLimits: [
    { label: 'daily', limit: 120, windowMs: 24 * 60 * 60 * 1000 },
  ],
  })) return;

  const bodyStr = JSON.stringify(req.body || {});
  if (bodyStr.length > MAX_BODY_BYTES) {
    return res.status(400).json({ error: 'Request too large.' });
  }

  // Accept an OpenAI-compatible request shape; model is ignored.
  const { messages, temperature = 0.1 } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages.' });
  }

  const totalChars = messages.reduce((n, m) => n + (m.content?.length || 0), 0);
  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    return res.status(400).json({ error: 'Prompt too long.' });
  }

  // Concatenate all message parts into a single user turn.
  const prompt = messages.map(m => m.content).join('\n\n');

  try {
    const client = getAuthClient();
    const { token } = await client.getAccessToken();

    const geminiRes = await fetch(
      `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens:  1400,
            responseMimeType: 'application/json', // Gemini enforces valid JSON output
            thinkingConfig:   { thinkingBudget: 0 }, // skip thinking for speed
          },
        }),
      }
    );

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      return res.status(500).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return res.status(500).json({ error: 'Empty response from Gemini.' });

    // Return an OpenAI-compatible envelope for the frontend helper.
    return res.status(200).json({ choices: [{ message: { content } }] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Gemini identify request failed.' });
  }
}
