import { useState, useRef, useCallback, useEffect } from 'react';
import { buildMicChain, closeMicStream, detectPitchDetailed, extractPitchFrames, mixToMono, findBestSegment, openMicStream } from '../utils/audioUtils';
import { getSwaram, identifyRaga, RAGAS } from '../utils/ragaLogic';

import { identifyRagaWithAI } from '../utils/ragaIdentify';
import SketchyRule from './SketchyRule';

const STATUS = {
  IDLE:        'idle',
  CALIBRATING: 'calibrating', // brief silence measurement before recording
  RECORDING:   'recording',
  UPLOADING:   'uploading',
  ANALYZING:   'analyzing',
  RESULTS:     'results',
  ERROR:       'error',
};

const MODE = { RECORD: 'record', UPLOAD: 'upload' };

const FRAME_MS       = 80;
const MAX_RECORD_SEC = 45;

// Western note names used only to display the inferred Sa to the user.
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function hzToNoteName(hz) {
    const semi = Math.round(12 * Math.log2(hz / 16.35));
    return `${NOTE_NAMES[((semi % 12) + 12) % 12]}${Math.floor(semi / 12)}`;
}

function stabilizeOctave(candidateHz, referenceHz) {
    if (!candidateHz || !referenceHz) return candidateHz;

    const doubled = candidateHz * 2;
    const halved = candidateHz / 2;
    const centsTo = (target, source) => Math.abs(1200 * Math.log2(target / source));

    if (candidateHz < referenceHz * 0.7 && doubled >= 60 && doubled <= 1600 && centsTo(doubled, referenceHz) <= 85) {
        return doubled;
    }
    if (candidateHz > referenceHz * 1.45 && halved >= 60 && halved <= 1600 && centsTo(halved, referenceHz) <= 85) {
        return halved;
    }
    return candidateHz;
}

// Group consecutive pitch frames into stable note events.
// Compares each new frame to the MODE semitone of the current group (not the last frame)
// so that natural pitch drift within a sustained note doesn't shatter the group.
// Requires ≥5 frames (~400 ms) to count — filters slides and brief ornaments.
function buildNoteEvents(hzFrames) {
    if (hzFrames.length < 5) return [];
    const toSemi = (hz) => Math.round(12 * Math.log2(hz / 130.81));

    let group   = [hzFrames[0]];
    let semiBin = { [toSemi(hzFrames[0])]: 1 }; // running semitone-count for this group
    let modeSemi = toSemi(hzFrames[0]);

    const getMode = (bin) => {
        let best = modeSemi, bestVal = 0;
        for (const [k, v] of Object.entries(bin)) { if (v > bestVal) { bestVal = v; best = +k; } }
        return best;
    };

    const events = [];
    const flush  = () => {
        if (group.length >= 5) {
            events.push({
                hz:         group.reduce((a, b) => a + b, 0) / group.length,
                durationMs: group.length * FRAME_MS,
            });
        }
    };

    for (let i = 1; i < hzFrames.length; i++) {
        const cs = toSemi(hzFrames[i]);
        if (Math.abs(cs - modeSemi) <= 2) {          // ±2 semitone tolerance handles vibrato
            group.push(hzFrames[i]);
            semiBin[cs] = (semiBin[cs] || 0) + 1;
            modeSemi = getMode(semiBin);
        } else {
            flush();
            group    = [hzFrames[i]];
            semiBin  = { [cs]: 1 };
            modeSemi = cs;
        }
    }
    flush();
    return events;
}

// Build a 12-bin pitch-class histogram from stable note events (weighted by duration).
// This tells us which notes the singer actually held longest.
function buildPitchHistogram(noteEvents) {
    const hist = new Array(12).fill(0);
    for (const { hz, durationMs } of noteEvents) {
        const bin = ((Math.round(12 * Math.log2(hz / 130.81)) % 12) + 12) % 12;
        hist[bin] += durationMs;
    }
    return hist;
}

// Return all 12 chromatic tonic candidates sorted by histogram weight (most-sung pitch class first).
// We evaluate every semitone — accuracy matters more than speed — but the ordering lets the
// best candidates bubble up so the composite sort below can pick the winner confidently.
function rankTonicCandidates(histogram) {
    return histogram
        .map((w, bin) => ({ bin, w }))
        .sort((a, b) => b.w - a.w)
        .map(({ bin }) => 130.81 * Math.pow(2, bin / 12));
}

// Score one candidate tonic. Returns null only if note variety is too low or no raga matches at all.
// Returns a composite `tonicScore` covering five dimensions so the caller can rank correctly even
// when two tonics produce the same identifyRaga score.
function scoreCandidate(saHz, noteEvents) {
    const noteFreqs   = {};
    const swaraList   = [];
    const noteSequence = []; // one swara per stable note event, in order (for phrase matching)

    for (const { hz, durationMs } of noteEvents) {
        const s = getSwaram(hz, saHz);
        if (!s) continue;
        noteSequence.push(s);
        const w = Math.max(1, Math.round(durationMs / 200));
        for (let i = 0; i < w; i++) swaraList.push(s);
        noteFreqs[s] = (noteFreqs[s] || 0) + w;
    }

    const unique = [...new Set(swaraList)];
    if (unique.length < 4) return null;

    const candidates = identifyRaga(unique, noteFreqs, noteSequence);
    if (!candidates.length || candidates[0].score < 1) return null;

    // ── Tonic quality dimensions ──────────────────────────────────────────────

    const totalWeight = Object.values(noteFreqs).reduce((a, b) => a + b, 0);

    // 1. Sa prominence: Sa should appear and carry reasonable duration weight.
    //    Reward proportionally up to 2.0; penalise lightly if Sa is absent.
    const saFraction = totalWeight > 0 ? (noteFreqs['Sa'] || 0) / totalWeight : 0;
    const saBonus    = saFraction > 0.03 ? Math.min(saFraction * 5, 2.0) : -0.5;

    // 2. Pa plausibility: Pa is a stable svara in the vast majority of ragas.
    const paBonus = (noteFreqs['Pa'] || 0) > 0 ? 0.3 : 0;

    // 3. Landing / nyasa plausibility: the last 3 note events should ideally
    //    resolve to Sa, Pa, or a Madhyama — the most common nyasa swaras.
    const tail      = noteEvents.slice(-3);
    const tailNotes = tail.map(e => getSwaram(e.hz, saHz)).filter(Boolean);
    const landingBonus = tailNotes.some(
        s => s === 'Sa' || s === 'Pa' || s === 'Ma1' || s === 'Ma2'
    ) ? 0.5 : 0;

    // 4. Phrase coherence proxy: fraction of consecutive note pairs that move
    //    by ≤2 semitones (stepwise) or wrap across the octave (Ni→Sa).
    //    Carnatic melody is overwhelmingly stepwise; a tonic that makes the
    //    transitions look like leaps is likely wrong.
    let stepCount = 0;
    for (let i = 1; i < noteEvents.length; i++) {
        const s1  = Math.round(12 * Math.log2(noteEvents[i - 1].hz / saHz));
        const s2  = Math.round(12 * Math.log2(noteEvents[i].hz     / saHz));
        const gap = Math.abs(((s2 - s1 + 6) % 12) - 6); // shortest circular distance
        if (gap <= 2) stepCount++;
    }
    const pairs          = Math.max(noteEvents.length - 1, 1);
    const coherenceBonus = (stepCount / pairs) * 0.8;

    const tonicScore = saBonus + paBonus + landingBonus + coherenceBonus;

    return { saHz, unique, noteFreqs, candidates, tonicScore };
}

// Build the swara evidence string in the format identifyRagaWithAI expects.
function buildSwaraString(noteEvents, saHz) {
    const noteSeq = noteEvents.map(({ hz, durationMs }) => {
        const s = getSwaram(hz, saHz);
        if (!s) return null;
        if (durationMs > 1500) return `${s}(very long)`;
        if (durationMs > 800)  return `${s}(long)`;
        return s;
    }).filter(Boolean).join(' ');

    const counts = {};
    const longCounts = {};
    noteEvents.forEach(({ hz, durationMs }) => {
        const s = getSwaram(hz, saHz);
        if (!s) return;
        counts[s] = (counts[s] || 0) + 1;
        if (durationMs > 800) longCounts[s] = (longCounts[s] || 0) + 1;
    });

    const freqSummary = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([n, c]) => `${n}×${c}${longCounts[n] ? `(${longCounts[n]} long)` : ''}`)
        .join(', ');

    // Approximate ascent/descent note distribution
    const ascentCounts = {};
    const descentCounts = {};
    for (let i = 1; i < noteEvents.length; i++) {
        const s = getSwaram(noteEvents[i].hz, saHz);
        if (!s) continue;
        if (noteEvents[i].hz > noteEvents[i - 1].hz * 1.03) {
            ascentCounts[s] = (ascentCounts[s] || 0) + 1;
        } else if (noteEvents[i].hz < noteEvents[i - 1].hz * 0.97) {
            descentCounts[s] = (descentCounts[s] || 0) + 1;
        }
    }
    const ascentStr  = Object.entries(ascentCounts).sort((a,b) => b[1]-a[1]).map(([n,c]) => `${n}×${c}`).join(', ');
    const descentStr = Object.entries(descentCounts).sort((a,b) => b[1]-a[1]).map(([n,c]) => `${n}×${c}`).join(', ');

    return `${noteSeq}\n\nNOTE FREQUENCY SUMMARY (most→least frequent): ${freqSummary}\nASCENT NOTES (approx): ${ascentStr || 'n/a'}\nDESCENT NOTES (approx): ${descentStr || 'n/a'}`;
}

export default function Viveka({ onSelectRaga }) {
    const [inputMode,  setInputMode]  = useState(MODE.RECORD);
    const [status,    setStatus]    = useState(STATUS.IDLE);
    const [elapsed,   setElapsed]   = useState(0);
    const [currentHz, setCurrentHz] = useState(null);
    const [results,   setResults]   = useState(null);
    const [errorMsg,  setErrorMsg]  = useState('');
    const [uploadProgress,    setUploadProgress]    = useState(0);  // 0-100 during file processing
    const [uploadSegmentInfo, setUploadSegmentInfo] = useState(null); // { startSec, endSec, filename }
    const [uploadStage, setUploadStage] = useState('Reading file…');

    const streamRef      = useRef(null);
    const analyserRef    = useRef(null);
    const pitchTimer     = useRef(null);
    const countTimer     = useRef(null);
    const autoStopTimer  = useRef(null);
    const framesRef      = useRef([]);
    const statusRef      = useRef(STATUS.IDLE);
    const inputModeRef   = useRef(MODE.RECORD);
    const fileInputRef   = useRef(null);
    const audioCtxRef    = useRef(null);
    const dynamicGateRef = useRef(0.004); // calibrated per-session noise floor
    const stablePitchRef = useRef(null);
    const holdFramesRef  = useRef(0);
    const recentPitchRef = useRef([]);

    useEffect(() => {
        inputModeRef.current = inputMode;
    }, [inputMode]);

    const cleanup = useCallback(() => {
        clearInterval(pitchTimer.current);
        clearInterval(countTimer.current);
        clearTimeout(autoStopTimer.current);
        closeMicStream(streamRef.current, audioCtxRef.current);
        streamRef.current = null;
        analyserRef.current = null;
        audioCtxRef.current = null;
        stablePitchRef.current = null;
        holdFramesRef.current = 0;
        recentPitchRef.current = [];
    }, []);

    const smoothPitch = useCallback((hz) => {
        const history = recentPitchRef.current;
        const last = history[history.length - 1];
        if (last && Math.abs(1200 * Math.log2(hz / last)) > 260) {
            history.length = 0;
        }
        history.push(hz);
        if (history.length > 4) history.shift();
        const sorted = [...history].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] || hz;
    }, []);

    const runAnalysis = useCallback(async (frames) => {
        const noteEvents = buildNoteEvents(frames);

        if (noteEvents.length < 4) {
            setErrorMsg('Could not detect enough stable notes. Try singing 5–6 notes slowly — hold each note for at least a second, and sing close to your mic.');
            setStatus(STATUS.ERROR);
            return;
        }

        // Evaluate all 12 chromatic tonic candidates, ordered by histogram weight so the
        // likeliest candidates are processed first. scoreCandidate returns null for any
        // tonic that produces fewer than 4 unique swaras or zero raga matches.
        const histogram       = buildPitchHistogram(noteEvents);
        const tonicCandidates = rankTonicCandidates(histogram);

        const scored = tonicCandidates
            .map(saHz => scoreCandidate(saHz, noteEvents))
            .filter(Boolean)
            .sort((a, b) => {
                // Primary rank: identifyRaga score + tonic quality composite.
                // tonicScore breaks ties when two tonics produce equally good raga matches.
                const compA = (a.candidates[0]?.score ?? -99) + a.tonicScore;
                const compB = (b.candidates[0]?.score ?? -99) + b.tonicScore;
                return compB - compA;
            });

        if (!scored.length) {
            setErrorMsg('Could not match the phrase to any known raga. Try a longer phrase with more varied notes.');
            setStatus(STATUS.ERROR);
            return;
        }

        const best      = scored[0];
        const bestScore = best.candidates[0]?.score ?? -99; // raw raga score, not composite

        const swaraString = buildSwaraString(noteEvents, best.saHz);

        // Ambiguity check uses the composite score so that a tonic with better Sa/landing
        // behaviour beats one that is numerically close on raga score alone.
        const compTop    = (best.candidates[0]?.score ?? 0) + best.tonicScore;
        const compSecond = scored[1] ? (scored[1].candidates[0]?.score ?? 0) + scored[1].tonicScore : 0;
        const tonicAmbiguous = compTop > 0 && compSecond / compTop > 0.88;

        // ── Multi-factor confidence model ────────────────────────────────────
        // Points accumulate across: raga score, separation, alien notes, phrase hits, tonic quality.
        const top        = best.candidates[0];
        const second     = scored[1]?.candidates[0];
        const ragaSep    = second ? (top.score ?? 0) - (second.score ?? 0) : (top.score ?? 0);
        const phraseHits = top.phraseMatches ?? 0;
        const confPoints = [
            (top.score ?? 0) >= 14 ? 2 : (top.score ?? 0) >= 8 ? 1 : 0,
            ragaSep >= 3           ? 2 : ragaSep >= 1.5         ? 1 : 0,
            (top.alienCount ?? 99) === 0 ? 1 : 0,
            phraseHits >= 2        ? 3 : phraseHits >= 1        ? 2 : 0,
            best.tonicScore >= 2   ? 1 : 0,
        ].reduce((a, b) => a + b, 0);
        const localConfidence = confPoints >= 7 ? 'high' : confPoints >= 3 ? 'medium' : 'low';

        // ── Result type ──────────────────────────────────────────────────────
        // 'identified' — high confidence with phrase evidence or large separation
        // 'likely'     — good match, moderate confidence
        // 'ambiguous'  — two candidates nearly tied
        // 'closest'    — best guess from weak evidence (always shown, never an error)
        const resultType    = (phraseHits >= 1 && ragaSep >= 2) || ragaSep >= 4 ? 'identified'
                            : phraseHits >= 1 || ragaSep >= 2                   ? 'likely'
                            : ragaSep < 1.5 && scored.length > 1                ? 'ambiguous'
                            : 'closest';
        const ambiguousWith = resultType === 'ambiguous' ? second?.name : null;

        let geminiResult = null;
        // Only send to Gemini if local evidence is meaningful — avoids wasting tokens on noise.
        if (bestScore >= 2) {
            try {
                geminiResult = await identifyRagaWithAI(swaraString, best.candidates.slice(0, 5));
            } catch (_) {
                // Network/API failure — fall back to local scoring only.
            }
        }

        const topOmission = top.omissionBonus > 0 ? `characteristic omissions detected` : '';
        const topMatches = geminiResult?.top_matches ?? best.candidates.slice(0, 3).map(c => ({
            raagam:     c.name,
            confidence: localConfidence,
            reasoning:  [
                `Matched ${c.matchCount} of the raga's scale notes`,
                c.alienCount === 0 ? 'no alien notes' : `${c.alienCount} alien note(s)`,
                c.phraseMatches > 0 ? `${c.phraseMatches} signature phrase(s) found` : '',
                c.omissionBonus > 0 ? 'characteristic omissions confirm identity' : '',
            ].filter(Boolean).join(' · '),
            prayogams:  [],
            family:     c.family,
        }));

        // Save the identification result so the learner model can track which ragas
        // the learner is working with and how often they practice each one.
        // confusedWith is intentionally omitted: an ambiguous classifier result is
        // model uncertainty about one audio clip, not evidence of a learner confusion
        // pattern. Confusion pairs are tracked from evaluated practice in Gurukul.
        window.__alapanaCoach?.saveSession({
            tool: 'viveka',
            raga: topMatches[0]?.raagam || '',
            outcome: resultType,
            confidence: localConfidence,
        });

        setResults({
            matches:      topMatches,
            saHz:         best.saHz,
            tonicAmbiguous,
            localOnly:    !geminiResult,
            resultType,
            ambiguousWith,
            localConfidence, // single source-of-truth confidence for the top match
            // Developer-facing: full intermediate analysis attached for debugging
            _debug: {
                noteEventCount: noteEvents.length,
                tonicHz:        best.saHz,
                tonicScore:     best.tonicScore,
                topLocal:       best.candidates.slice(0, 5).map(c => ({
                    name:    c.name,
                    score:   +c.score.toFixed(2),
                    matchCount:   c.matchCount,
                    alienCount:   c.alienCount,
                    phraseMatches: c.phraseMatches,
                })),
            },
        });
        setStatus(STATUS.RESULTS);
    }, []);

    const stopAndAnalyze = useCallback(() => {
        if (statusRef.current !== STATUS.RECORDING) return;
        statusRef.current = STATUS.ANALYZING;
        cleanup();
        const frames = [...framesRef.current];
        setStatus(STATUS.ANALYZING);
        runAnalysis(frames);
    }, [cleanup, runAnalysis]);

    const startRecording = async () => {
        if (inputModeRef.current !== MODE.RECORD || statusRef.current !== STATUS.IDLE) return;
        framesRef.current = [];
        setCurrentHz(null);
        setResults(null);
        setErrorMsg('');
        setElapsed(0);

        try {
            const stream = await openMicStream();
            const { ctx, analyser } = buildMicChain(stream, { fftSize: 4096, gain: 4.0 });
            audioCtxRef.current = ctx;
            if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
            streamRef.current = stream;

            statusRef.current = STATUS.RECORDING;
            setStatus(STATUS.RECORDING);
            analyserRef.current = analyser;

            // ── Calibration: measure ambient noise floor ───────────────────
            // Sample 1.5 s of silence so the gate adapts to drones, AC hum,
            // or any other room noise rather than using a fixed threshold.
            statusRef.current = STATUS.CALIBRATING;
            setStatus(STATUS.CALIBRATING);

            const calibRMS = [];
            const calibInterval = setInterval(() => {
                const a = analyserRef.current;
                if (!a) return;
                const b = new Float32Array(a.fftSize);
                a.getFloatTimeDomainData(b);
                let sq = 0;
                for (let i = 0; i < b.length; i++) sq += b[i] * b[i];
                calibRMS.push(Math.sqrt(sq / b.length));
            }, 80);

            await new Promise(r => setTimeout(r, 1500));
            clearInterval(calibInterval);

            if (!analyserRef.current) return; // cancelled during calibration

            // Gate = 4× the 75th-percentile silence RMS (rejects drone/hum,
            // accepts singing which is typically 5–15× above the noise floor).
            const sorted = [...calibRMS].sort((a, b) => a - b);
            const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0.0015;
            dynamicGateRef.current = Math.min(Math.max(p75 * 1.25, 0.0016), 0.006);
            // ──────────────────────────────────────────────────────────────

            statusRef.current = STATUS.RECORDING;
            setStatus(STATUS.RECORDING);

            // Require a short stable run so real singing registers more reliably than
            // one-off noisy estimates from autocorrelation.
            const pitchBuf = [];
            pitchTimer.current = setInterval(() => {
                if (!analyserRef.current) return;
                const detection = detectPitchDetailed(analyserRef.current, ctx.sampleRate, dynamicGateRef.current);
                if (!detection?.freq) {
                    const sustainGate = dynamicGateRef.current * 0.52;
                    if (stablePitchRef.current && detection?.rms >= sustainGate && holdFramesRef.current < 3) {
                        holdFramesRef.current += 1;
                        setCurrentHz(stablePitchRef.current);
                        const prev = framesRef.current[framesRef.current.length - 1];
                        if (!prev || Math.abs(Math.log2(stablePitchRef.current / prev)) < 0.45) {
                            framesRef.current.push(stablePitchRef.current);
                        }
                        return;
                    }
                    holdFramesRef.current += 1;
                    if (holdFramesRef.current >= 3) {
                        setCurrentHz(null);
                    }
                    return;
                }

                holdFramesRef.current = 0;
                const hz = stabilizeOctave(detection.freq, stablePitchRef.current);
                const smoothedHz = smoothPitch(hz);
                const prevStablePitch = stablePitchRef.current;
                if (!prevStablePitch || Math.abs(1200 * Math.log2(smoothedHz / prevStablePitch)) <= 320) {
                    stablePitchRef.current = smoothedHz;
                }
                setCurrentHz(smoothedHz);

                const last = pitchBuf[pitchBuf.length - 1];
                if (last && Math.abs(Math.log2(smoothedHz / last)) >= 0.55) {
                    pitchBuf.length = 0;
                }

                pitchBuf.push(smoothedHz);
                if (pitchBuf.length > 4) pitchBuf.shift();
                if (pitchBuf.length < 3) return;

                const semis = pitchBuf.map(f => Math.round(12 * Math.log2(f / 130.81)));
                const stable = semis.every(s => Math.abs(s - semis[0]) <= 2);
                if (!stable) return;

                const prev = framesRef.current[framesRef.current.length - 1];
                if (!prev || Math.abs(Math.log2(smoothedHz / prev)) < 0.55) {
                    framesRef.current.push(smoothedHz);
                }
            }, FRAME_MS);

            countTimer.current    = setInterval(() => setElapsed(e => e + 1), 1000);
            autoStopTimer.current = setTimeout(stopAndAnalyze, MAX_RECORD_SEC * 1000);
        } catch (err) {
            cleanup();
            setErrorMsg(
                err.name === 'NotAllowedError'
                    ? 'Microphone access denied — please allow mic access and try again.'
                    : err.message || String(err)
            );
            setStatus(STATUS.ERROR);
        }
    };

    const reset = () => {
        cleanup();
        statusRef.current = STATUS.IDLE;
        setStatus(STATUS.IDLE);
        dynamicGateRef.current = 0.004;
        setResults(null);
        setErrorMsg('');
        setElapsed(0);
        setCurrentHz(null);
        setUploadProgress(0);
        setUploadSegmentInfo(null);
        setUploadStage('Reading file…');
        framesRef.current = [];
    };

    const handleFileUpload = async (file) => {
        if (!file || !file.type.startsWith('audio/')) {
            setErrorMsg('Please upload an audio file (mp3, wav, m4a, etc.)');
            setStatus(STATUS.ERROR);
            return;
        }
        reset();
        setStatus(STATUS.UPLOADING);
        setUploadProgress(5);
        setUploadSegmentInfo(null);
        setUploadStage('Reading file…');

        try {
            const arrayBuffer = await file.arrayBuffer();
            setUploadProgress(15);

            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') {
                try {
                    await ctx.resume();
                } catch {
                    // If resume fails, the fallback extractor may still succeed.
                }
            }
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            setUploadProgress(22);
            setUploadStage('Selecting clearest section…');

            // Mix all channels to mono so stereo files don't lose the right channel.
            const mono = mixToMono(audioBuffer);

            // Find the highest-energy 25-second window instead of blindly using the start.
            const { startSample, endSample, startSec, endSec } =
                findBestSegment(mono, audioBuffer.sampleRate, 25);

            const segInfo = {
                filename: file.name,
                startSec: +startSec.toFixed(1),
                endSec:   +endSec.toFixed(1),
            };
            setUploadSegmentInfo(segInfo);
            setUploadProgress(28);
            setUploadStage('Extracting melody…');

            setUploadProgress(50);
            const fb = await extractPitchFrames(audioBuffer, { startSample, endSample });
            let frames = fb.frames;
            let rawCount = fb.frames.length;

            ctx.close();
            setUploadProgress(100);
            setUploadStage('Preparing results…');

            // Debug output — always logged, useful for diagnosing weak results
            console.debug('[Viveka upload]', {
                file:              file.name,
                totalDuration:     (audioBuffer.length / audioBuffer.sampleRate).toFixed(1) + 's',
                selectedSegment:   `${segInfo.startSec}s – ${segInfo.endSec}s`,
                channels:          audioBuffer.numberOfChannels,
                rawFrames:         rawCount,
                stableFrames:      frames.length,
            });

            if (frames.length < 6) {
                setErrorMsg(
                    `Only ${frames.length} stable notes detected in the clearest section ` +
                    `(${segInfo.startSec}–${segInfo.endSec}s). ` +
                    `Try uploading a clip where the lead melody is louder and less cluttered ` +
                    `— or record it closer to your microphone.`
                );
                setStatus(STATUS.ERROR);
                return;
            }

            setStatus(STATUS.ANALYZING);
            runAnalysis(frames);
        } catch (err) {
            setErrorMsg(err.message || 'Could not read the audio file.');
            setStatus(STATUS.ERROR);
        }
    };

    const handleSelectRaga = (ragaName) => {
        const ragaData = RAGAS[ragaName];
        if (ragaData && onSelectRaga) {
            onSelectRaga({ raga: { name: ragaName, ...ragaData }, hasClearMatch: true, type: 'identify' });
        }
    };

    const confidenceBadge = (c) => {
        if (c === 'high')   return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
        if (c === 'medium') return 'text-c-gold bg-c-gold/10 border-c-gold/30';
        return 'text-c-cream-dark bg-white/5 border-c-border';
    };

    // Surface debug info to console so developers can inspect intermediate analysis
    // without needing a dedicated UI panel.
    if (results?._debug) console.debug('[Viveka analysis]', results._debug);

    const resultLabel = results?.resultType === 'identified' ? 'Identified'
                     : results?.resultType === 'likely'      ? 'Most likely'
                     : results?.resultType === 'ambiguous'   ? 'Ambiguous'
                     : 'Closest match';

    const guidanceMsg = results?.resultType === 'ambiguous'
        ? `Between ${results.matches[0]?.raagam} and ${results.ambiguousWith} — try the most characteristic phrase`
        : results?.tonicAmbiguous
        ? 'Tonic was uncertain — start or end your phrase clearly on Sa'
        : results?.resultType === 'closest'
        ? 'Weak match — try a longer phrase with more movement'
        : null;

    const ragaFamily = (ragaName) => {
        const type = RAGAS[ragaName]?.type;
        if (!type) return null;
        const m = type.match(/Janya · (.+?) \(/);
        return m ? m[1] : null;
    };

    const pct = Math.min((elapsed / MAX_RECORD_SEC) * 100, 100);

    return (
        <main className="w-full max-w-3xl mx-auto flex flex-col items-center gap-7 px-4 md:px-8 py-10 animate-fade-in">
            <div className="w-full flex flex-col items-center gap-7">

                {/* Header */}
                <div className="w-full flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-c-card border border-c-gold/30 flex items-center justify-center text-c-gold shadow-md flex-shrink-0">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="2" fill="#C8941F" stroke="none" />
                                <circle cx="12" cy="12" r="5" strokeOpacity="0.5" />
                                <circle cx="12" cy="12" r="9" strokeOpacity="0.25" fill="currentColor" fillOpacity="0.04" />
                                <line x1="12" y1="3" x2="12" y2="6" strokeOpacity="0.3" />
                                <line x1="12" y1="18" x2="12" y2="21" strokeOpacity="0.3" />
                                <line x1="3" y1="12" x2="6" y2="12" strokeOpacity="0.3" />
                                <line x1="18" y1="12" x2="21" y2="12" strokeOpacity="0.3" />
                            </svg>
                        </div>
                        <div className="flex flex-col text-left">
                            <div className="flex items-center gap-2">
                                <h1 className="font-playfair text-xl font-bold tracking-wider text-c-gold uppercase leading-none">Viveka</h1>
                                <span className="text-[8px] uppercase tracking-widest bg-c-gold/15 text-c-gold px-2 py-0.5 rounded font-semibold border border-c-gold/20 leading-none">Identify</span>
                            </div>
                            <p className="text-c-cream-dim text-[11px] mt-1 font-light leading-none">
                                Sing freely — Viveka discerns the raga.
                            </p>
                        </div>
                    </div>
                    {status !== STATUS.IDLE && (
                        <button
                            onClick={reset}
                            className="text-xs text-c-cream-dark hover:text-c-gold transition-colors font-playfair underline underline-offset-2"
                        >
                            Start over
                        </button>
                    )}
                </div>

                <SketchyRule className="mt-2 opacity-60" />

                {/* ── IDLE ── */}
                {status === STATUS.IDLE && (
                    <div className="w-full flex flex-col items-center gap-8 py-4">

                        {/* Mode tabs */}
                        <div className="flex gap-1 bg-c-surface border border-c-border rounded-lg p-1 w-full max-w-xs">
                            {[
                                { id: MODE.RECORD, label: 'Sing / Hum' },
                                { id: MODE.UPLOAD, label: 'Upload audio' },
                            ].map(tab => (
                                <button
                                    type="button"
                                    key={tab.id}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setInputMode(tab.id);
                                    }}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all ${
                                        inputMode === tab.id
                                            ? 'bg-c-gold text-c-bg'
                                            : 'text-c-cream-dark hover:text-c-cream'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Record mode */}
                        {inputMode === MODE.RECORD && (
                            <>
                                <button
                                    type="button"
                                    onClick={startRecording}
                                    className="relative w-32 h-32 rounded-full bg-c-card border-2 border-c-gold/50 hover:border-c-gold hover:bg-c-gold-faint flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 group shadow-lg"
                                >
                                    <svg className="w-8 h-8 text-c-gold" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>
                                        <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 11z" fillOpacity="0.7"/>
                                    </svg>
                                    <span className="text-c-gold text-[9px] font-mono uppercase tracking-widest font-bold group-hover:text-c-gold-light">Tap to identify</span>
                                </button>
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <p className="text-[11px] text-c-cream-dark opacity-60">
                                        Sing, hum, or play near your microphone · 10–45 sec
                                    </p>
                                    <p className="text-[10px] text-c-cream-dark font-playfair italic opacity-40">
                                        No setup needed — Viveka finds the tonic automatically
                                    </p>
                                </div>
                            </>
                        )}

                        {/* Upload mode */}
                        {inputMode === MODE.UPLOAD && (
                            <div className="w-full max-w-sm flex flex-col items-center gap-4 group">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full border-2 border-dashed border-c-gold/30 hover:border-c-gold/60 rounded-xl py-10 flex flex-col items-center gap-3 transition-all bg-c-surface hover:bg-c-card"
                                >
                                    <svg className="w-10 h-10 text-c-gold/40 group-hover:text-c-gold/70 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                                    </svg>
                                    <div className="text-center">
                                        <p className="font-playfair text-c-cream text-sm">Drop an audio clip here</p>
                                        <p className="text-xs text-c-cream-dark opacity-50 mt-1">or click to browse</p>
                                    </div>
                                    <span className="text-[9px] text-c-cream-dark/40 font-mono uppercase tracking-widest">mp3 · wav · m4a · ogg · flac</span>
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="audio/*"
                                    className="hidden"
                                    onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                />
                                <p className="text-[10px] text-c-cream-dark font-playfair italic opacity-40 text-center">
                                    Best with clear lead melody · Viveka finds the closest raga match
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── CALIBRATING ── */}
                {status === STATUS.CALIBRATING && (
                    <div className="w-full flex flex-col items-center gap-5 py-8">
                        <div className="flex gap-1.5 items-end h-5">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1 bg-c-gold/40 rounded-full animate-pulse"
                                    style={{ height: `${8 + (i % 3) * 4}px`, animationDelay: `${i * 0.15}s` }}
                                />
                            ))}
                        </div>
                        <div className="text-center flex flex-col gap-1.5">
                            <p className="font-playfair text-c-cream-dim">Please be silent…</p>
                            <p className="text-[11px] text-c-cream-dark font-playfair italic">
                                Measuring your room's noise floor · takes 1–2 seconds
                            </p>
                        </div>
                        <button
                            onClick={reset}
                            className="text-xs text-c-cream-dark hover:text-c-gold transition-colors font-playfair underline underline-offset-2"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {/* ── RECORDING ── */}
                {status === STATUS.RECORDING && (
                    <div className="w-full flex flex-col items-center gap-6">
                        <div className="flex items-center gap-3">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                            <span className="font-playfair text-c-cream italic">Listening</span>
                            <span className="font-mono text-c-gold text-sm tabular-nums">{elapsed}s</span>
                            <span className="text-c-cream-dark text-xs font-mono opacity-60">/ {MAX_RECORD_SEC}s max</span>
                        </div>

                        <div className="w-full h-1.5 bg-c-border rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-c-gold-dim to-c-gold transition-all duration-1000 rounded-full"
                                style={{ width: `${pct}%` }}
                            />
                        </div>

                        {/* Live pitch readout */}
                        <div className="text-center">
                            <div className="font-playfair text-5xl text-c-cream tabular-nums">
                                {currentHz ? currentHz.toFixed(0) : '·'}
                            </div>
                            <div className="text-[9px] uppercase tracking-widest text-c-cream-dark mt-1.5 font-mono opacity-60">
                                Hz · sing steadily, hold each note
                            </div>
                        </div>

                        {/* 7-bar waveform */}
                        <div className={`flex items-end gap-[3px] h-5 ${currentHz ? 'wave-active' : ''}`}>
                            {[...Array(7)].map((_, i) => (
                                <div key={i} className="wave-bar bg-c-gold-dim" />
                            ))}
                        </div>

                        <button
                            onClick={stopAndAnalyze}
                            className="px-8 py-2.5 bg-c-gold hover:bg-c-gold-light text-c-bg font-semibold text-sm rounded transition-all active:scale-95"
                        >
                            Analyze Now
                        </button>
                        <p className="text-[10px] text-c-cream-dark font-playfair italic opacity-60">
                            Or wait — auto-analyzes at {MAX_RECORD_SEC}s
                        </p>
                    </div>
                )}

                {/* ── UPLOADING ── */}
                {status === STATUS.UPLOADING && (
                    <div className="w-full flex flex-col items-center gap-4 py-8">
                        <div className="w-8 h-8 border-2 border-c-gold/30 border-t-c-gold rounded-full animate-spin" />
                        <div className="text-center flex flex-col gap-1">
                            <p className="font-playfair text-c-cream italic">
                                {uploadStage}
                            </p>
                            {uploadSegmentInfo && (
                                <p className="text-[10px] text-c-cream-dark font-mono opacity-60">
                                    Best section: {uploadSegmentInfo.startSec}s – {uploadSegmentInfo.endSec}s
                                </p>
                            )}
                        </div>
                        <div className="w-full max-w-xs h-1 bg-c-border rounded-full overflow-hidden">
                            <div
                                className="h-full bg-c-gold transition-all duration-300 rounded-full"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <p className="text-[9px] text-c-cream-dark font-mono opacity-40 uppercase tracking-widest">
                            {uploadProgress < 28 ? 'Decoding audio' : uploadProgress < 92 ? 'This may take ~25 seconds' : 'Finalizing analysis'}
                        </p>
                    </div>
                )}

                {/* ── ANALYZING ── */}
                {status === STATUS.ANALYZING && (
                    <div className="w-full flex flex-col items-center gap-5 py-8">
                        <div className="w-8 h-8 border-2 border-c-gold/30 border-t-c-gold rounded-full animate-spin" />
                        <div className="text-center flex flex-col gap-1.5">
                            <p className="font-playfair text-c-cream italic">Identifying the raga…</p>
                            <p className="text-[11px] text-c-cream-dark font-playfair italic opacity-70">
                                Mapping notes · testing tonics · matching raga patterns
                            </p>
                        </div>
                    </div>
                )}

                {/* ── RESULTS ── */}
                {status === STATUS.RESULTS && results && (
                    <div className="w-full flex flex-col gap-4 animate-fade-in">

                        {/* Shazam-style result header */}
                        <div className="w-full flex flex-col items-center gap-1 py-2">
                            <span className={`text-[9px] font-mono uppercase tracking-[0.2em] ${
                                results.resultType === 'identified' ? 'text-emerald-400' :
                                results.resultType === 'likely'     ? 'text-c-gold' :
                                results.resultType === 'ambiguous'  ? 'text-amber-400' :
                                                                      'text-c-cream-dark'
                            }`}>
                                {resultLabel}
                            </span>
                            {/* Family bucket — one layer above the identity */}
                            {ragaFamily(results.matches[0]?.raagam) && (
                                <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-c-cream-dark/40 mb-0.5">
                                    {ragaFamily(results.matches[0]?.raagam)} family
                                </p>
                            )}
                            <h2 className="font-playfair text-3xl font-bold text-c-cream leading-none tracking-wide">
                                {results.matches[0]?.raagam}
                            </h2>
                            {RAGAS[results.matches[0]?.raagam]?.mood && (
                                <p className="text-c-gold/70 text-xs font-playfair italic mt-0.5">
                                    {RAGAS[results.matches[0]?.raagam].mood}
                                </p>
                            )}
                            {results.saHz && (
                                <p className="text-[10px] text-c-cream-dark/40 font-mono mt-1">
                                    Sa ≈ {results.saHz.toFixed(1)} Hz · {hzToNoteName(results.saHz)}
                                </p>
                            )}
                        </div>

                        {/* Guidance / hint */}
                        {guidanceMsg && (
                            <div className="w-full bg-c-gold/5 border border-c-gold/20 rounded-lg px-4 py-2.5 text-[11px] text-c-cream-dark font-playfair italic text-center">
                                {guidanceMsg}
                            </div>
                        )}

                        {/* Ambiguity callout — this is a diagnostic moment, not learner-memory evidence */}
                        {results.resultType === 'ambiguous' && results.ambiguousWith && (
                            <div className="w-full bg-amber-700/6 border border-amber-700/20 rounded-lg px-4 py-2.5 flex items-center gap-2.5">
                                <svg className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                                </svg>
                                <p className="text-[10px] text-amber-800 font-mono leading-relaxed">
                                    Viveka hears this phrase as close to both {results.matches[0]?.raagam} and {results.ambiguousWith}. Use Raga Kosha to compare them side by side, then drill the difference in Gurukul.
                                </p>
                            </div>
                        )}

                        {results.localOnly && (
                            <div className="w-full bg-c-border/10 border border-c-border/30 rounded-lg px-4 py-2 text-[10px] text-c-cream-dark font-mono text-center opacity-50">
                                AI unavailable · local pattern match only
                            </div>
                        )}

                        {/* Match cards */}
                        <div className="flex flex-col gap-3">
                            {results.matches.slice(0, 3).map((match, idx) => {
                                const localData = RAGAS[match.raagam];
                                return (
                                    <div
                                        key={idx}
                                        className={`w-full border rounded-xl overflow-hidden transition-all ${
                                            idx === 0
                                                ? 'border-c-gold/40 bg-c-card shadow-[0_0_20px_rgba(247,214,134,0.04)]'
                                                : 'border-c-border/60 bg-c-surface'
                                        }`}
                                    >
                                        <div className="px-5 py-3.5 flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <span className="text-[11px] text-c-cream-dark font-mono mt-0.5 flex-shrink-0 opacity-50">
                                                    {idx === 0 ? '◆' : idx === 1 ? '◇' : '·'}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="font-playfair text-lg font-bold text-c-cream leading-none">
                                                            {match.raagam}
                                                        </h3>
                                                        {localData && (
                                                            <span className="text-[8px] uppercase tracking-widest text-c-cream-dark opacity-50 font-mono">
                                                                {localData.type}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {localData?.mood && (
                                                        <p className="text-[10px] text-c-gold/70 font-playfair italic mt-0.5 leading-snug">
                                                            {localData.mood}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={`text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border flex-shrink-0 mt-0.5 ${confidenceBadge(match.confidence)}`}>
                                                {match.confidence}
                                            </span>
                                        </div>

                                        {match.reasoning && (
                                            <div className="px-5 pb-3.5 border-t border-c-border/30 pt-3">
                                                <p className="text-[11px] text-c-cream-dark leading-relaxed font-playfair italic">
                                                    {match.reasoning}
                                                </p>
                                            </div>
                                        )}

                                        {match.prayogams?.length > 0 && (
                                            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                                                {match.prayogams.map((p, pi) => (
                                                    <span key={pi} className="text-[9px] font-mono bg-c-gold/10 border border-c-gold/20 text-c-gold px-2 py-0.5 rounded">
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {localData && (
                                            <div className="px-5 pb-3.5">
                                                <button
                                                    onClick={() => handleSelectRaga(match.raagam)}
                                                    className="text-[10px] text-c-gold/70 hover:text-c-gold font-playfair italic underline underline-offset-2 transition-colors"
                                                >
                                                    Explore {match.raagam} in Raga Kosha →
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex justify-center pt-2">
                            <button
                                onClick={reset}
                                className="px-6 py-2 border border-c-gold/40 hover:border-c-gold hover:bg-c-gold-faint text-c-gold text-sm rounded transition-all font-playfair"
                            >
                                Identify another
                            </button>
                        </div>
                    </div>
                )}

                {/* ── ERROR ── */}
                {status === STATUS.ERROR && (
                    <div className="w-full flex flex-col items-center gap-5 py-4">
                        <div className="w-full max-w-sm bg-red-900/20 border border-red-800/40 rounded-xl px-5 py-4 text-center">
                            <p className="text-red-400 text-sm font-playfair">{errorMsg}</p>
                        </div>
                        <button
                            onClick={reset}
                            className="px-6 py-2 border border-c-gold/40 hover:border-c-gold hover:bg-c-gold-faint text-c-gold text-sm rounded transition-all font-playfair"
                        >
                            Try again
                        </button>
                    </div>
                )}

            </div>
        </main>
    );
}
