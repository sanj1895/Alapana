/**
 * Client for the Go AI gateway (gateway/), which calls Gemini 2.5 Flash.
 *
 * The browser sends typed practice data only: swara events, pitch statistics,
 * raga names. Every prompt is built on the server, so the client can never
 * send the model arbitrary text. Requests carry the Clerk session token.
 */

// App.jsx registers Clerk's getToken here, so helpers outside React can authenticate.
let getAuthToken = null;

export function setAuthTokenProvider(provider) {
    getAuthToken = provider;
}

async function callAI(task, payload) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const token = getAuthToken ? await getAuthToken() : null;
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* the gateway answers 401 below */ }

    const response = await fetch(`/api/ai/${task}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error('Please sign in again to use AI feedback.');
        if (response.status === 429) {
            throw new Error(err.scope === 'daily'
                ? 'You have reached today’s AI usage limit. Please come back tomorrow.'
                : 'You are sending requests too quickly. Please wait a moment and try again.');
        }
        throw new Error(err.error || `AI request failed (${response.status})`);
    }
    return response.json();
}

/**
 * Rank the local scorer's shortlist against the sung notes.
 * notes: [{ swara, durationMs, direction? }] where direction is 'up', 'down' or 'level'.
 * localCandidates: identifyRaga() results; only the scoring fields are sent.
 */
export async function identifyRagaWithAI(notes, localCandidates = []) {
    const candidates = localCandidates.slice(0, 5).map(c => ({
        name: c.name,
        matchCount: c.matchCount,
        alienCount: c.alienCount,
        phraseMatches: c.phraseMatches ?? 0,
        score: c.score,
    }));
    const { result } = await callAI('rank-ragas', { notes, candidates });
    return result;
}

export async function askAboutRaga(ragaName) {
    const { result } = await callAI('raga-lookup', { ragaName });
    return {
        ...result,
        type: `AI Search · ${result.parent}`,
        color: 'teal',
        video: null,
    };
}

// Raga Practice feedback from measured intonation, resonance, breath and gamakas.
export async function getPracticeFeedback(measurements) {
    const { text } = await callAI('practice-feedback', measurements);
    return text;
}

// Gurukul lesson feedback comparing the sung swaras with the exercise.
export async function getLessonFeedback(performance) {
    const { text } = await callAI('lesson-feedback', performance);
    return text;
}
