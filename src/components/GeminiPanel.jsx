import { useState, useRef } from 'react';
import { identifyRagaWithAI } from '../utils/ragaIdentify';
import { getSwaram, identifyRaga, RAGAS } from '../utils/ragaLogic';
import { detectPitch } from '../utils/audioUtils';



const RECORD_SECS = 30;
const MIN_SCORE   = 4.0;
const STATES = { IDLE: 'idle', RECORDING: 'recording', PROCESSING: 'processing', RESULT: 'result', ERROR: 'error' };

export default function GeminiPanel({ saFrequency }) {
    const [panelState, setPanelState] = useState(STATES.IDLE);
    const [countdown, setCountdown]   = useState(RECORD_SECS);
    const [result, setResult]         = useState(null);
    const [errorMsg, setErrorMsg]     = useState('');
    const [currentSwaraStream, setCurrentSwaraStream] = useState([]);

    const swaraStreamRef = useRef([]);
    const timerRef      = useRef(null);
    const pitchTimerRef = useRef(null);
    const streamRef     = useRef(null);
    const recordingFlag = useRef(false);

    const startRecording = async () => {
        if (!saFrequency) {
            alert('Please find and set your Sa Frequency first using the Pitch Detection panel!');
            return;
        }

        setErrorMsg('');
        swaraStreamRef.current = [];
        setCurrentSwaraStream([]);
        recordingFlag.current = true;

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = mediaStream;

            setPanelState(STATES.RECORDING);
            setCountdown(RECORD_SECS);

            const source = audioCtx.createMediaStreamSource(mediaStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);

            const pitchBuf = [];
            pitchTimerRef.current = setInterval(() => {
                if (!recordingFlag.current) return;
                const frequency = detectPitch(analyser, audioCtx.sampleRate);
                if (frequency) {
                    const now = Date.now();
                    const lastBuf = pitchBuf[pitchBuf.length - 1];
                    if (lastBuf && Math.abs(Math.log2(frequency / lastBuf)) >= 0.6) {
                        pitchBuf.length = 0;
                    } else {
                        pitchBuf.push(frequency);
                        if (pitchBuf.length > 3) pitchBuf.shift();
                        if (pitchBuf.length === 3) {
                            const semis = pitchBuf.map(f => Math.round(12 * Math.log2(f / saFrequency)));
                            const stable = semis.every(s => Math.abs(s - semis[0]) <= 1);
                            if (stable) {
                                const swaram = getSwaram(frequency, saFrequency);
                                if (swaram) {
                                    const len = swaraStreamRef.current.length;
                                    if (len === 0 || swaraStreamRef.current[len - 1].note !== swaram) {
                                        swaraStreamRef.current.push({ note: swaram, start: now, duration: 0 });
                                    } else {
                                        swaraStreamRef.current[len - 1].duration = now - swaraStreamRef.current[len - 1].start;
                                    }
                                    const uiNotes = swaraStreamRef.current.filter(x => x.duration > 100).map(x => x.note);
                                    setCurrentSwaraStream(uiNotes.slice(-8));
                                }
                            }
                        }
                    }
                }
            }, 80);

            let remaining = RECORD_SECS;
            timerRef.current = setInterval(() => {
                remaining -= 1;
                setCountdown(remaining);
                if (remaining <= 0) stopEarly();
            }, 1000);
        } catch (err) {
            setErrorMsg(err.message);
            setPanelState(STATES.ERROR);
            recordingFlag.current = false;
        }
    };

    const stopEarly = async () => {
        clearInterval(timerRef.current);
        clearInterval(pitchTimerRef.current);
        recordingFlag.current = false;
        streamRef.current?.getTracks().forEach(t => t.stop());

        setPanelState(STATES.PROCESSING);
        try {
            const validNotes = swaraStreamRef.current.filter(x => x.duration > 120);

            if (validNotes.length < 8) {
                throw new Error('Not enough distinct musical notes detected. Sing clearly for at least 15 seconds, holding each note.');
            }

            // Duration-weighted note frequency map for identifyRaga.
            const noteFreqs = {};
            const swaraList = [];
            const longNoteCounts = {};
            validNotes.forEach(x => {
                const w = Math.max(1, Math.round((x.duration + 120) / 200));
                for (let i = 0; i < w; i++) swaraList.push(x.note);
                noteFreqs[x.note] = (noteFreqs[x.note] || 0) + w;
                if (x.duration > 800) longNoteCounts[x.note] = (longNoteCounts[x.note] || 0) + 1;
            });
            const unique = [...new Set(swaraList)];

            // Local shortlist — must clear MIN_SCORE before we trust the evidence enough to call Gemini.
            const localCandidates = identifyRaga(unique, noteFreqs);
            if (!localCandidates.length || localCandidates[0].score < MIN_SCORE) {
                throw new Error('The phrase didn\'t match any known raga confidently. Try singing a longer melodic phrase with more note variety.');
            }

            const condensed = validNotes.map(x => {
                if (x.duration > 1500) return `${x.note}(very long)`;
                if (x.duration > 800) return `${x.note}(long)`;
                return x.note;
            }).join(' ');

            // Simple event count for display summary (not weighted).
            const noteCounts = {};
            validNotes.forEach(x => { noteCounts[x.note] = (noteCounts[x.note] || 0) + 1; });
            const freqSummary = Object.entries(noteCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([note, count]) => `${note}×${count}${longNoteCounts[note] ? `(${longNoteCounts[note]} long)` : ''}`)
                .join(', ');
            const condensedWithSummary = `${condensed}\n\nNOTE FREQUENCY SUMMARY (most→least frequent): ${freqSummary}`;

            const res = await identifyRagaWithAI(condensedWithSummary, localCandidates);
            setResult(res);
            setPanelState(STATES.RESULT);
        } catch (err) {
            setErrorMsg(err.message);
            setPanelState(STATES.ERROR);
        }
    };

    const reset = () => {
        clearInterval(timerRef.current);
        setPanelState(STATES.IDLE);
        setResult(null);
        setErrorMsg('');
        setCountdown(RECORD_SECS);
        recordingFlag.current = false;
        setCurrentSwaraStream([]);
    };

    const progressPct = Math.round(((RECORD_SECS - countdown) / RECORD_SECS) * 100);

    return (
        <div className="w-full border border-c-border bg-c-surface rounded-xl overflow-hidden flex flex-col">
            <div className="bg-c-gold-faint border-b border-c-gold/30 p-3 flex gap-3 items-start">
                <span className="text-c-gold mt-0.5">ℹ️</span>
                <p className="text-xs text-c-cream-dim leading-relaxed">
                    This section is for users who are already well-versed and want to analyze advanced raagams. Beginners should complete the Curriculum first!
                </p>
            </div>
            
            <div className="border-b border-c-border px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-c-gold/40 text-xs">✦</span>
                    <h2 className="font-playfair text-sm text-c-cream-dim italic">Ālaap AI Analysis</h2>
                </div>
                <span className="text-[10px] text-c-cream-dark font-mono opacity-50">Gemini 2.5 Flash</span>
            </div>

            <div className="p-6 flex flex-col items-center gap-5">
                {panelState === STATES.IDLE && (
                    <div className="flex flex-col items-center gap-4 w-full">
                        <p className="text-c-cream-dark text-xs text-center max-w-xs font-playfair italic leading-relaxed">
                            Set your Sa, then sing or play for 30s. We'll transcribe it to swaras directly in your browser, then send the sequence to AI for analysis!
                        </p>
                        <button
                            onClick={startRecording}
                            disabled={!saFrequency}
                            className={`px-8 py-2.5 border text-sm rounded transition-all font-playfair tracking-wide ${!saFrequency ? 'border-c-border text-c-border cursor-not-allowed opacity-50' : 'border-c-gold/60 hover:border-c-gold hover:bg-c-gold-faint text-c-gold'}`}
                        >
                            {saFrequency ? 'Record 30s for AI' : 'Waiting for you to set Sa…'}
                        </button>
                    </div>
                )}

                {panelState === STATES.RECORDING && (
                    <div className="flex flex-col items-center gap-4 w-full">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-c-cream text-sm font-playfair italic">Transcribing…</span>
                            <span className="font-mono text-c-gold text-sm tabular-nums">{countdown}s</span>
                        </div>
                        <div className="w-full h-1 bg-c-border rounded-full overflow-hidden">
                            <div className="h-full bg-c-gold transition-all duration-1000 rounded-full"
                                 style={{ width: `${progressPct}%` }} />
                        </div>
                        <div className="h-4 flex items-center justify-center overflow-hidden w-full max-w-xs">
                            <p className="text-[10px] text-c-cream-dim text-center opacity-70 tracking-widest uppercase">
                                {currentSwaraStream.join(' - ')}
                            </p>
                        </div>
                        <button onClick={stopEarly}
                                className="text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2">
                            Done early  ·  analyze now
                        </button>
                    </div>
                )}

                {panelState === STATES.PROCESSING && (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-5 h-5 border-2 border-c-gold/30 border-t-c-gold rounded-full animate-spin" />
                        <p className="text-c-cream-dark text-xs font-playfair italic">Ālaap AI is analyzing the notes…</p>
                    </div>
                )}

                {panelState === STATES.RESULT && result?.top_matches && (
                    <div className="w-full flex flex-col gap-6 animate-fade-in">
                        <h3 className="text-center font-playfair text-xl text-c-cream-dim border-b border-c-border pb-2 mb-2">Top 3 Guesses</h3>

                        {result.top_matches.map((match, idx) => {
                            const localData = RAGAS[match.raagam];
                            const videoUrl = localData?.video;

                            return (
                                <div key={idx} className="flex flex-col gap-3 bg-c-card border border-c-border rounded-lg p-5">
                                    <div className="text-center relative z-10">
                                        <div className="font-playfair text-xl text-c-gold-light tracking-wide">{idx + 1}. {match.raagam}</div>
                                        <div className={`text-xs mt-1 font-playfair italic capitalize ${
                                            { high: 'text-emerald-400', medium: 'text-c-gold', low: 'text-amber-600' }[match.confidence] || 'text-c-cream-dim'
                                        }`}>
                                            {match.confidence} confidence
                                        </div>
                                    </div>

                                    <div className="bg-c-bg/60 border border-c-border/50 rounded px-4 py-2 flex flex-col gap-2 text-xs relative z-10">
                                        <div className="flex gap-3">
                                            <span className="text-c-cream-dark w-20 flex-shrink-0 font-playfair italic">Arohanam</span>
                                            <span className="text-c-cream font-mono tracking-wide">{match.arohanam}</span>
                                        </div>
                                        <div className="h-px bg-c-border/40" />
                                        <div className="flex gap-3">
                                            <span className="text-c-cream-dark w-20 flex-shrink-0 font-playfair italic">Avarohanam</span>
                                            <span className="text-c-cream font-mono tracking-wide">{match.avarohanam}</span>
                                        </div>
                                    </div>

                                    <div className="mt-2 relative z-10">
                                        {videoUrl ? (
                                            <a
                                                href={videoUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-center gap-2 w-full py-2 bg-c-gold/10 hover:bg-c-gold/20 border border-c-gold/30 rounded text-c-gold text-xs transition-all font-playfair italic font-medium"
                                            >
                                                <span>▶ Watch Curated Performance</span>
                                            </a>
                                        ) : (
                                            <a
                                                href={`https://www.youtube.com/results?search_query=carnatic+raga+${match.raagam}+concert`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center justify-center gap-2 w-full py-2 bg-c-bg/30 hover:bg-c-bg/50 border border-c-border rounded text-c-cream-dim text-[10px] transition-all tracking-wider uppercase font-semibold"
                                            >
                                                <span className="opacity-60">🔍</span> Search YouTube for {match.raagam}
                                            </a>
                                        )}
                                    </div>

                                    {match.prayogams?.length > 0 && (
                                        <div className="flex flex-col gap-1.5 mt-1 relative z-10">
                                            <div className="text-[10px] text-c-cream-dark tracking-widest uppercase font-playfair">
                                                Prayogams identified
                                            </div>
                                            {match.prayogams.map((p, i) => (
                                                <div key={i} className="flex items-start gap-2 text-xs text-c-cream-dim font-playfair italic">
                                                    <span className="text-c-gold/40 mt-px">◆</span>
                                                    <span>{p}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {match.reasoning && (
                                        <p className="text-xs text-c-cream-dark font-playfair italic leading-relaxed border-l-2 border-c-gold/20 pl-3 mt-1 relative z-10">
                                            {match.reasoning}
                                        </p>
                                    )}
                                </div>
                            );
                        })}

                        <button onClick={reset}
                                className="self-center text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2 font-playfair italic mt-2">
                            Analyze again
                        </button>
                    </div>
                )}

                {panelState === STATES.ERROR && (
                    <div className="flex flex-col items-center gap-3 w-full">
                        <p className="text-xs text-red-400 text-center font-playfair italic max-w-xs">{errorMsg}</p>
                        <button onClick={reset}
                                className="text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2">
                            Try again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
