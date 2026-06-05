import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RAGAS, getSwaram } from '../../utils/ragaLogic';
import { detectPitch as detectPitchAudio, muteAppAudio, openMicStream, buildMicChain, closeMicStream } from '../../utils/audioUtils';
import {
    getAudioCtx,
    swaraFreq,
    getTokenSwara,
    getTokenDuration,
    playSingleTone,
    playContourTone,
} from './shared';
import {
    ExerciseListenSequence,
    ExerciseSing,
    ExerciseSingSequence,
    playTick,
} from './LessonRunner';

function RagaSession({ ragaName, raga, sa, onBack }) {
    const [phase, setPhase] = useState('listen_aro'); // listen_aro | sing_aro_notes | listen_ava | sing_ava_notes | sing_aro_seq | sing_ava_seq | sing_full_seq | quiz | done
    const [singIdx, setSingIdx] = useState(0);

    // Sequence completion tracking
    const [passedFullSeq, setPassedFullSeq] = useState(false);

    useEffect(() => {
        if (phase === 'done') {
            try {
                const existing = JSON.parse(localStorage.getItem('mastered_ragas') || '[]');
                if (!existing.includes(ragaName)) {
                    existing.push(ragaName);
                    localStorage.setItem('mastered_ragas', JSON.stringify(existing));
                    // Dispatch a custom event to notify of localstorage update
                    window.dispatchEvent(new Event('localStorage-mastered-ragas-updated'));
                }
            } catch (e) {
                console.error(e);
            }
        }
    }, [phase, ragaName]);

    // Quiz states
    const [quizNote, setQuizNote] = useState(null);
    const [quizChoices, setQuizChoices] = useState([]);
    const [selectedQuizChoice, setSelectedQuizChoice] = useState(null);
    const [quizAnswered, setQuizAnswered] = useState(false);

    const arohanam = raga.arohanam.map((note, idx) => {
        if (idx === raga.arohanam.length - 1 && note === 'Sa') {
            return 'Ṡ';
        }
        return note;
    });

    const avarohanam = raga.avarohanam.map((note, idx) => {
        if (idx === 0 && note === 'Sa') {
            return 'Ṡ';
        }
        return note;
    });

    const fullScale = [...arohanam, ...avarohanam];

    const steps = [
        { key: 'listen_aro', label: '1. Aro Listen', icon: '🔊' },
        { key: 'sing_aro_notes', label: '2. Aro Notes', icon: '🎵' },
        { key: 'listen_ava', label: '3. Ava Listen', icon: '🔉' },
        { key: 'sing_ava_notes', label: '4. Ava Notes', icon: '🎶' },
        { key: 'sing_aro_seq', label: '5. Aro Flow', icon: '📈' },
        { key: 'sing_ava_seq', label: '6. Ava Flow', icon: '📉' },
        { key: 'sing_full_seq', label: '7. Scale Flow', icon: '🔄' },
        { key: 'quiz', label: '8. Ear Test', icon: '🧠' },
        { key: 'done', label: '9. Done', icon: '🏆' },
    ];

    const initQuiz = () => {
        const options = arohanam.filter(n => n !== 'Sa' && n !== 'Ṡ');
        const correct = options[Math.floor(Math.random() * options.length)];
        setQuizNote(correct);

        // choices: the correct note + 2 other random notes from the scale
        const wrong = options.filter(n => n !== correct);
        const choices = [correct];
        while (choices.length < Math.min(3, options.length + 1)) {
            const w = wrong[Math.floor(Math.random() * wrong.length)];
            if (w && !choices.includes(w)) choices.push(w);
        }
        // Shuffle choices
        setQuizChoices(choices.sort(() => Math.random() - 0.5));
        setSelectedQuizChoice(null);
        setQuizAnswered(false);
    };

    const playQuizNote = () => {
        if (!quizNote) return;
        const freq = swaraFreq(quizNote, sa);
        playSingleTone(freq, 1.2);
    };

    const handleSingAroDone = () => {
        if (singIdx + 1 >= arohanam.length) {
            setPhase('listen_ava');
        } else {
            setSingIdx(i => i + 1);
        }
    };

    const handleSingAvaDone = () => {
        if (singIdx + 1 >= avarohanam.length) {
            setPhase('sing_aro_seq');
        } else {
            setSingIdx(i => i + 1);
        }
    };

    return (
        <div className="w-full max-w-lg mx-auto flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="text-c-cream-dark hover:text-c-gold text-lg transition-colors">←</button>
                <div>
                    <div className="font-playfair text-lg text-c-gold">{ragaName}</div>
                    <div className="text-[10px] text-c-cream-dark uppercase tracking-widest">{raga.type}</div>
                </div>
            </div>

            {/* Pipeline progress bar tracker (Clickable Tabs) */}
            <div className="w-full flex justify-between items-center px-2 py-3 border-b border-c-border/40 mb-2 overflow-x-auto gap-2">
                {steps.map((s) => {
                    const activeIdx = steps.findIndex(st => st.key === phase);
                    const isActive = s.key === phase;
                    const isPast = steps.findIndex(st => st.key === s.key) < activeIdx;
                    return (
                        <button
                            key={s.key}
                            onClick={() => {
                                if (s.key === 'done') {
                                    if (!passedFullSeq) {
                                        alert("To graduate and unlock the final trophy, you must successfully sing and pass the Scale Flow (Step 7: ascending and descending combined sequence)!");
                                        return;
                                    }
                                }
                                setPhase(s.key);
                                setSingIdx(0);
                                if (s.key === 'quiz') {
                                    initQuiz();
                                }
                            }}
                            className="flex flex-col items-center gap-1 flex-1 min-w-[36px] focus:outline-none group"
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${
                                isActive ? 'bg-c-gold text-c-bg font-bold scale-110 shadow-lg shadow-c-gold/20' :
                                isPast ? 'bg-c-gold/20 text-c-gold border border-c-gold/30 hover:bg-c-gold/30' :
                                'bg-c-surface border border-c-border text-c-cream-dark hover:border-c-gold/45 hover:text-c-gold'
                            }`} title={s.label}>
                                {s.icon}
                            </div>
                            {isActive ? (
                                <span className="text-[8px] font-playfair font-bold text-c-gold whitespace-nowrap animate-pulse">{s.label.split('. ')[1]}</span>
                            ) : (
                                <span className="text-[7px] text-c-cream-dark font-sans opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{s.label.split('. ')[1]}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="min-h-[340px] flex items-center justify-center py-4">
                {phase === 'listen_aro' && (
                    <ExerciseListenSequence
                        key="raga-listen-aro"
                        swaras={arohanam}
                        sa={sa}
                        instruction={`Step 1: Listen to the ascending ${ragaName} scale (Arohanam).`}
                        onDone={() => { setPhase('sing_aro_notes'); setSingIdx(0); }}
                    />
                )}

                {phase === 'sing_aro_notes' && (
                    <ExerciseSing
                        key={`sing-aro-${singIdx}`}
                        swara={arohanam[singIdx]}
                        sa={sa}
                        instruction={`Step 2: Sing note ${singIdx + 1} of ${arohanam.length} (Arohanam Ascending)`}
                        onDone={handleSingAroDone}
                    />
                )}

                {phase === 'listen_ava' && (
                    <ExerciseListenSequence
                        key="raga-listen-ava"
                        swaras={avarohanam}
                        sa={sa}
                        instruction={`Step 3: Listen to the descending ${ragaName} scale (Avarohanam).`}
                        onDone={() => { setPhase('sing_ava_notes'); setSingIdx(0); }}
                    />
                )}

                {phase === 'sing_ava_notes' && (
                    <ExerciseSing
                        key={`sing-ava-${singIdx}`}
                        swara={avarohanam[singIdx]}
                        sa={sa}
                        instruction={`Step 4: Sing note ${singIdx + 1} of ${avarohanam.length} (Avarohanam Descending)`}
                        onDone={handleSingAvaDone}
                    />
                )}

                {phase === 'sing_aro_seq' && (
                    <ExerciseSingSequence
                        key="sing-seq-aro"
                        swaras={arohanam}
                        sa={sa}
                        instruction="Step 5: Sing the entire Arohanam sequence in one continuous, metered flow!"
                        onDone={() => setPhase('sing_ava_seq')}
                    />
                )}

                {phase === 'sing_ava_seq' && (
                    <ExerciseSingSequence
                        key="sing-seq-ava"
                        swaras={avarohanam}
                        sa={sa}
                        instruction="Step 6: Sing the entire Avarohanam sequence in one continuous, metered flow!"
                        onDone={() => setPhase('sing_full_seq')}
                    />
                )}

                {phase === 'sing_full_seq' && (
                    <ExerciseSingSequence
                        key="sing-seq-full"
                        swaras={fullScale}
                        sa={sa}
                        instruction="Step 7: The Ultimate Scale Challenge! Sing the entire scale ascending and descending back-to-back!"
                        onDone={() => {
                            setPassedFullSeq(true);
                            initQuiz();
                            setPhase('quiz');
                        }}
                    />
                )}

                {phase === 'quiz' && (
                    <div className="flex flex-col items-center gap-5 w-full max-w-sm bg-c-surface border border-c-border rounded-2xl p-4 sm:p-6 text-center animate-fade-in">
                        <span className="text-3xl">🧠</span>
                        <h4 className="font-playfair text-lg text-c-gold font-bold">Step 8: Ear Challenge Test</h4>
                        <p className="text-xs text-c-cream-dark leading-relaxed">
                            Identify the swara pitch played from the scale of {ragaName}!
                        </p>
                        
                        <button onClick={playQuizNote}
                                className="px-6 py-2 bg-c-gold text-c-bg rounded-full text-xs font-bold font-playfair hover:opacity-90 transition-opacity my-2 flex items-center gap-1.5 justify-center mx-auto">
                            <span>🔈</span> Hear Note
                        </button>

                        <div className="flex justify-center gap-2.5 w-full mt-2">
                            {quizChoices.map(c => {
                                const isSelected = selectedQuizChoice === c;
                                const isCorrect = c === quizNote;
                                let btnStyle = "border-c-border text-c-cream-dim hover:border-c-gold/45 bg-c-bg";
                                if (quizAnswered) {
                                    if (isCorrect) btnStyle = "bg-emerald-850/15 border-emerald-800/30 text-emerald-850 font-bold";
                                    else if (isSelected) btnStyle = "bg-rose-950/15 border-rose-800/30 text-rose-850 font-bold";
                                    else btnStyle = "opacity-40 border-c-border text-c-cream-dark";
                                } else if (isSelected) {
                                    btnStyle = "border-c-gold text-c-gold bg-c-gold/5";
                                }
                                
                                return (
                                    <button key={c}
                                            disabled={quizAnswered}
                                            onClick={() => {
                                                setSelectedQuizChoice(c);
                                                setQuizAnswered(true);
                                            }}
                                            className={`flex-1 py-3 border rounded-xl text-sm font-mono transition-all ${btnStyle}`}>
                                        {c}
                                    </button>
                                );
                            })}
                        </div>

                        {quizAnswered && (
                            <div className="mt-4 animate-fade-in w-full">
                                <p className={`text-sm font-bold ${selectedQuizChoice === quizNote ? 'text-emerald-850' : 'text-rose-850'}`}>
                                    {selectedQuizChoice === quizNote ? '🎉 Spot on! Correct answer!' : `❌ Almost! That was actually ${quizNote}.`}
                                </p>
                                <button onClick={() => {
                                            if (!passedFullSeq) {
                                                alert("To graduate and unlock the final trophy, you must successfully sing and pass the Scale Flow (Step 7)!");
                                                return;
                                            }
                                            setPhase('done');
                                        }}
                                        className="px-8 py-2.5 bg-c-gold text-c-bg rounded-full text-xs font-bold font-playfair hover:opacity-95 transition-opacity mt-4 w-full">
                                    Finish & Graduate
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {phase === 'done' && (
                    <div className="flex flex-col items-center gap-5 animate-fade-in text-center">
                        <div className="w-16 h-16 rounded-full border border-c-gold/40 bg-c-gold-faint flex items-center justify-center text-c-gold text-2xl shadow-lg shadow-c-gold/10">🏆</div>
                        <div>
                            <p className="font-playfair text-xl text-c-gold font-bold">Raga Mastered!</p>
                            <p className="text-xs text-c-cream-dark mt-1 font-playfair italic">{raga.mood && `${raga.mood} · `}{raga.type}</p>
                            <p className="text-xs text-c-cream-dim mt-2 max-w-xs leading-relaxed mx-auto">
                                Incredible work! You've successfully heard, sung, sequenced, and ear-identified the notes of {ragaName}.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 mt-1 w-full max-w-sm text-left">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-c-gold/60 uppercase font-mono tracking-wider">Arohanam (Ascending):</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {arohanam.map((n, i) => (
                                        <span key={i} className="px-2 py-1 rounded border border-c-gold/30 text-xs font-mono text-c-gold bg-c-gold/5">{n}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-c-gold/60 uppercase font-mono tracking-wider">Avarohanam (Descending):</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {avarohanam.map((n, i) => (
                                        <span key={i} className="px-2 py-1 rounded border border-c-gold/30 text-xs font-mono text-c-gold bg-c-gold/5">{n}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => { setPhase('listen_aro'); setSingIdx(0); }}
                                    className="px-5 py-2 border border-c-border text-c-cream-dim text-xs rounded-full font-playfair hover:border-c-gold/40 transition-colors">
                                Practice again
                            </button>
                            <button onClick={onBack}
                                    className="px-5 py-2 bg-c-gold text-c-bg text-xs rounded-full font-playfair font-bold hover:opacity-90 transition-opacity">
                                All ragas
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sing progress dots */}
            {(phase === 'sing_aro_notes' || phase === 'sing_ava_notes') && (
                <div className="flex justify-center gap-1.5">
                    {(phase === 'sing_aro_notes' ? arohanam : avarohanam).map((_n, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
                            i < singIdx ? 'bg-emerald-500' : i === singIdx ? 'bg-c-gold' : 'bg-c-border'
                        }`} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Tala-aligned Swara Transcriber ──────────────────────────────────────────

function TalaSwaraTranscriber({ sa, setSa }) {
    const isLikelyMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '');
    const TALA_PRESETS = [
        { id: 'adi', name: 'Adi', groups: [4, 2, 2], unitLabel: '8-beat cycle' },
        { id: 'rupaka', name: 'Rupaka', groups: [2, 4], unitLabel: '6-beat cycle' },
        { id: 'misra_chapu', name: 'Misra Chapu', groups: [3, 2, 2], unitLabel: '7-beat cycle' },
        { id: 'khanda_chapu', name: 'Khanda Chapu', groups: [2, 3], unitLabel: '5-beat cycle' },
        { id: 'ata', name: 'Khanda Jathi Ata', groups: [5, 5, 2, 2], unitLabel: '14-beat cycle' },
    ];

    const [talaId, setTalaId] = useState('adi');
    const [bpm, setBpm] = useState(64);
    const [subdiv, setSubdiv] = useState(4);
    const [avartanas, setAvartanas] = useState(2);
    const [phase, setPhase] = useState('idle'); // idle | countdown | recording | done | error
    const [countdown, setCountdown] = useState(4);
    const [micError, setMicError] = useState('');
    const [currentBeat, setCurrentBeat] = useState(0);
    const [progressPct, setProgressPct] = useState(0);
    const [transcribed, setTranscribed] = useState([]);
    const [transcribedText, setTranscribedText] = useState('');
    const [playbackEvents, setPlaybackEvents] = useState([]);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState('');
    const [playIdx, setPlayIdx] = useState(-1);
    const [isPlayingTranscription, setIsPlayingTranscription] = useState(false);
    const [isPreviewingTempo, setIsPreviewingTempo] = useState(false);
    const [anchorOnlyMode, setAnchorOnlyMode] = useState(false);
    const [mobileMicMode, setMobileMicMode] = useState(isLikelyMobile);

    const streamRef = useRef(null);
    const recordingCtxRef = useRef(null);
    const sourceRef = useRef(null);
    const analyserRef = useRef(null);
    const bucketsRef = useRef([]);
    const startTimeRef = useRef(0);
    const intervalRef = useRef(null);
    const beatTimerRef = useRef(null);
    const previewTimerRef = useRef(null);
    const playAbortRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const frameHistoryRef = useRef([]);
    const octaveStateRef = useRef({ stable: 0, pending: null, pendingCount: 0 });
    const noiseProfileRef = useRef(0.004);
    const sustainBridgeRef = useRef({ label: ',', freqSemi: null, frames: 0 });

    const activeTala = TALA_PRESETS.find(t => t.id === talaId) || TALA_PRESETS[0];
    const talaGroups = activeTala.groups;
    const BEATS_PER_AVARTANA = talaGroups.reduce((a, b) => a + b, 0);
    const talaSpec = { name: activeTala.name, groups: activeTala.groups, unitLabel: activeTala.unitLabel };

    const detectSwaraWithOctave = useCallback((freqHz) => {
        if (!freqHz || !sa) return null;
        const base = getSwaram(freqHz, sa);
        if (!base) return null;

        // Relative semitone distance from base Sa; this preserves octave register.
        const semitones = 12 * (Math.log(freqHz / sa) / Math.log(2));
        const rounded = Math.round(semitones);
        const octaveShift = Math.floor(rounded / 12);

        // Support one register above/below base in current notation system.
        if (octaveShift >= 1) return `${base}^`;
        if (octaveShift <= -1) return `${base}.`;
        return base;
    }, [sa]);

    const yinEstimate = useCallback((buffer, sampleRate) => {
        const threshold = 0.14;
        const maxTau = Math.min(1024, Math.floor(sampleRate / 60));
        const minTau = Math.max(2, Math.floor(sampleRate / 1200));
        const yin = new Float32Array(maxTau + 1);

        for (let tau = 1; tau <= maxTau; tau++) {
            let sum = 0;
            for (let i = 0; i < buffer.length - tau; i++) {
                const d = buffer[i] - buffer[i + tau];
                sum += d * d;
            }
            yin[tau] = sum;
        }

        yin[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau <= maxTau; tau++) {
            runningSum += yin[tau];
            yin[tau] = runningSum === 0 ? 1 : (yin[tau] * tau) / runningSum;
        }

        let tauEstimate = -1;
        let bestTau = minTau;
        for (let tau = minTau; tau <= maxTau; tau++) {
            if (yin[tau] < yin[bestTau]) bestTau = tau;
            if (yin[tau] < threshold) {
                while (tau + 1 <= maxTau && yin[tau + 1] < yin[tau]) tau++;
                tauEstimate = tau;
                break;
            }
        }
        if (tauEstimate === -1) {
            // Fall back to the strongest low-CMND candidate so softer or ornamented
            // frames still contribute to transcription instead of disappearing.
            if (yin[bestTau] > 0.34) return null;
            tauEstimate = bestTau;
        }

        const confidence = Math.max(0, 1 - yin[tauEstimate]);
        const freq = sampleRate / tauEstimate;
        if (!Number.isFinite(freq) || freq < 60 || freq > 1500) return null;
        return { freq, confidence };
    }, []);

    const resolveOctaveWithHysteresis = useCallback((baseSwara, semitones) => {
        const candidate = Math.floor(Math.round(semitones) / 12);
        const st = octaveStateRef.current;
        const lockFrames = mobileMicMode ? 3 : 2;
        if (candidate === st.stable) {
            st.pending = null;
            st.pendingCount = 0;
        } else if (st.pending === candidate) {
            st.pendingCount += 1;
            if (st.pendingCount >= lockFrames) {
                st.stable = candidate;
                st.pending = null;
                st.pendingCount = 0;
            }
        } else {
            st.pending = candidate;
            st.pendingCount = 1;
        }
        const octave = st.stable;
        if (octave >= 1) return `${baseSwara}^`;
        if (octave <= -1) return `${baseSwara}.`;
        return baseSwara;
    }, [mobileMicMode]);

    const transcribeFramesToSlots = useCallback((frames, totalSlots, slotMs) => {
        const grid = Array.from({ length: totalSlots }, () => []);
        const slotDurSec = slotMs / 1000;
        const onsetTolerance = slotDurSec * 0.32;
        const minSegSec = Math.max(slotDurSec * 0.1, 0.016);
        const slotMeta = Array.from({ length: totalSlots }, () => ({ voiced: 0, hold: 0, strong: 0 }));

        // Smooth labels lightly so we keep real fast note turns instead of ironing
        // them away during geetham/manodharma transcription.
        const smoothed = frames.map((_, i) => {
            const window = frames.slice(Math.max(0, i - 1), Math.min(frames.length, i + 2));
            const counts = {};
            window.forEach(f => {
                const k = f.label || ',';
                counts[k] = (counts[k] || 0) + 1;
            });
            return { ...frames[i], label: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ',' };
        });

        smoothed.forEach((frame) => {
            const slot = Math.floor(frame.time / slotDurSec);
            if (slot < 0 || slot >= totalSlots || frame.label === ',') return;
            slotMeta[slot].voiced += 1;
            if (frame.hold) slotMeta[slot].hold += 1;
            if (frame.strong) slotMeta[slot].strong += 1;
        });

        // Segment contiguous labels.
        const segments = [];
        let cur = null;
        smoothed.forEach((f) => {
            if (!cur || cur.label !== f.label) {
                if (cur) segments.push(cur);
                cur = {
                    label: f.label,
                    start: f.time,
                    end: f.time,
                    glideCount: f.glide ? 1 : 0,
                    count: 1,
                    strongCount: f.strong ? 1 : 0,
                    bridgedCount: f.bridged ? 1 : 0,
                    holdCount: f.hold ? 1 : 0,
                };
            } else {
                cur.end = f.time;
                cur.count += 1;
                if (f.glide) cur.glideCount += 1;
                if (f.strong) cur.strongCount += 1;
                if (f.bridged) cur.bridgedCount += 1;
                if (f.hold) cur.holdCount += 1;
            }
        });
        if (cur) segments.push(cur);

        // Place note segments into quantized onset/duration slots.
        segments.forEach(seg => {
            const segDurSec = Math.max(0.001, seg.end - seg.start);
            if (seg.label === ',' || segDurSec < minSegSec) return;
            const glideRatio = seg.glideCount / Math.max(1, seg.count);
            const strongRatio = seg.strongCount / Math.max(1, seg.count);
            const bridgedRatio = seg.bridgedCount / Math.max(1, seg.count);
            const holdRatio = seg.holdCount / Math.max(1, seg.count);
            if (anchorOnlyMode && glideRatio > 0.62 && segDurSec < slotDurSec * 1.05) return;
            if (strongRatio < 0.24 && bridgedRatio > 0.62 && segDurSec < slotDurSec * 1.25) return;
            if (holdRatio > 0.95 && strongRatio < 0.08 && segDurSec < slotDurSec * 0.75) return;
            if (strongRatio < 0.12 && segDurSec < slotDurSec * 0.72) return;

            const rawSlot = seg.start / slotDurSec;
            const snappedSlot = Math.round(rawSlot);
            const snapErrSec = Math.abs(snappedSlot - rawSlot) * slotDurSec;
            const onsetSlot = Math.max(0, snapErrSec <= onsetTolerance ? snappedSlot : Math.floor(rawSlot));
            const rawEndSlot = (seg.end / slotDurSec) - 0.02;
            const releaseSlot = Math.max(onsetSlot, Math.ceil(rawEndSlot));

            for (let idx = onsetSlot; idx <= releaseSlot; idx++) {
                if (idx >= 0 && idx < totalSlots) grid[idx].push(seg.label);
            }
        });

        return grid.map((bucket, idx) => {
            if (!bucket.length) return ',';
            const counts = {};
            bucket.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
            const label = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
            const meta = slotMeta[idx];
            const prevLabel = idx > 0 ? grid[idx - 1].find((n) => n !== ',') || null : null;
            if (label === prevLabel && meta.voiced > 0 && meta.hold >= Math.max(1, Math.round(meta.voiced * 0.5)) && meta.strong === 0) {
                return '-';
            }
            return label;
        });
    }, [anchorOnlyMode]);

    const buildPlaybackEvents = useCallback((tokens, frames) => {
        const unitSec = (60 / bpm);
        const voicedFrames = frames.filter((frame) => frame.label && frame.label !== ',' && Number.isFinite(frame.freqSemi));
        let beatCursor = 0;
        let activeEvent = null;
        const events = [];

        tokens.forEach((token, idx) => {
            const swara = getTokenSwara(token);
            if (swara === '|' || swara === '||') return;
            const duration = getTokenDuration(token);

            if (swara === '-') {
                if (activeEvent?.type === 'note') {
                    activeEvent.duration += duration;
                } else if (events.length > 0 && events[events.length - 1].type === 'rest') {
                    events[events.length - 1].duration += duration;
                    activeEvent = events[events.length - 1];
                } else {
                    activeEvent = { type: 'rest', duration, tokenIndex: idx, startBeat: beatCursor };
                    events.push(activeEvent);
                }
                beatCursor += duration;
                return;
            }

            if (swara === ',') {
                if (events.length > 0 && events[events.length - 1].type === 'rest') {
                    events[events.length - 1].duration += duration;
                    activeEvent = events[events.length - 1];
                } else {
                    activeEvent = { type: 'rest', duration, tokenIndex: idx, startBeat: beatCursor };
                    events.push(activeEvent);
                }
                beatCursor += duration;
                return;
            }

            const startSec = beatCursor * unitSec;
            const endSec = (beatCursor + duration) * unitSec;
            const tolerance = Math.min(0.08, unitSec * 0.2);
            const contourFrames = voicedFrames.filter((frame) => (
                frame.time >= startSec - tolerance && frame.time <= endSec + tolerance
            ));
            const contour = contourFrames.length
                ? contourFrames.map((frame) => ({
                    at: Math.max(0, Math.min(endSec - startSec, frame.time - startSec)),
                    freq: sa * Math.pow(2, frame.freqSemi / 12),
                }))
                : [];
            activeEvent = {
                type: 'note',
                swara,
                duration,
                tokenIndex: idx,
                startBeat: beatCursor,
                contour,
            };
            events.push(activeEvent);
            beatCursor += duration;
        });

        while (events.length && events[0].type === 'rest') events.shift();
        while (events.length && events[events.length - 1].type === 'rest') events.pop();
        return events;
    }, [bpm, sa]);

    const cleanup = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (beatTimerRef.current) clearInterval(beatTimerRef.current);
        if (previewTimerRef.current) clearInterval(previewTimerRef.current);
        intervalRef.current = null;
        beatTimerRef.current = null;
        previewTimerRef.current = null;
        setIsPreviewingTempo(false);
        frameHistoryRef.current = [];
        octaveStateRef.current = { stable: 0, pending: null, pendingCount: 0 };
        noiseProfileRef.current = 0.004;
        sustainBridgeRef.current = { label: ',', freqSemi: null, frames: 0 };
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
        closeMicStream(streamRef.current, recordingCtxRef.current);
        streamRef.current = null;
        recordingCtxRef.current = null;
        sourceRef.current = null;
        analyserRef.current = null;
    }, []);

    useEffect(() => () => cleanup(), [cleanup]);
    useEffect(() => {
        return () => {
            if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
        };
    }, [recordedAudioUrl]);

    const stopTranscriptionPlayback = useCallback(() => {
        playAbortRef.current?.abort();
        setIsPlayingTranscription(false);
        setPlayIdx(-1);
    }, []);

    useEffect(() => () => stopTranscriptionPlayback(), [stopTranscriptionPlayback]);

    const bucketsToTokens = useCallback((slotNotes) => {
        const unitDur = 1 / subdiv;
        const tokens = [];
        let prev = null;
        let run = 0;

        const flush = () => {
            if (!prev || run <= 0) return;
            const dur = run * unitDur;
            tokens.push(dur === 1 ? prev : { swara: prev, duration: dur });
        };

        slotNotes.forEach((n, idx) => {
            const isBar = ((idx + 1) % subdiv) === 0;
            if (prev === n) run += 1;
            else {
                flush();
                prev = n;
                run = 1;
            }

            if (isBar) {
                flush();
                const beatIdx = Math.floor((idx + 1) / subdiv);
                const isAvartanaEnd = (beatIdx % BEATS_PER_AVARTANA) === 0;
                tokens.push(isAvartanaEnd ? '||' : '|');
                prev = null;
                run = 0;
            }
        });

        flush();
        return tokens;
    }, [subdiv, BEATS_PER_AVARTANA]);

    const tokensToReadableText = useCallback((tokens) => (
        tokens.map((t) => {
            const s = getTokenSwara(t);
            if (s === '|' || s === '||' || s === ',') return s;
            const d = getTokenDuration(t);
            return d === 1 ? s : `${s}(${d.toFixed(2)})`;
        }).join(' ')
    ), []);

    const hasDetectedNotes = useCallback((tokens) => (
        tokens.some((token) => {
            const swara = getTokenSwara(token);
            return swara && swara !== ',' && swara !== '|' && swara !== '||';
        })
    ), []);

    const finishRecording = useCallback(() => {
        const beatMs = (60 / bpm) * 1000;
        const slotMs = beatMs / subdiv;
        const totalSlots = BEATS_PER_AVARTANA * subdiv * avartanas;
        const frameSlotNotes = transcribeFramesToSlots(frameHistoryRef.current, totalSlots, slotMs);
        const fallbackSlotBuckets = bucketsRef.current;
        const fallbackSlotNotes = fallbackSlotBuckets.map((bucket) => {
            const entries = Object.entries(bucket);
            if (entries.length === 0) return ',';
            entries.sort((a, b) => b[1] - a[1]);
            return entries[0][0];
        });
        const frameTokens = bucketsToTokens(frameSlotNotes);
        const fallbackTokens = bucketsToTokens(fallbackSlotNotes);
        const tokens = hasDetectedNotes(frameTokens)
            ? frameTokens
            : (hasDetectedNotes(fallbackTokens) ? fallbackTokens : []);

        if (!tokens.length) {
            setTranscribed([]);
            setTranscribedText('');
            setMicError('No clear notes were detected. Try singing a little closer to the mic, verify Sa, or enable Mobile Mic Mode.');
            cleanup();
            setPhase('error');
            return;
        }

        setTranscribed(tokens);
        setTranscribedText(tokensToReadableText(tokens));
        setPlaybackEvents(buildPlaybackEvents(tokens, frameHistoryRef.current));
        cleanup();
        setPhase('done');
    }, [BEATS_PER_AVARTANA, avartanas, bpm, bucketsToTokens, buildPlaybackEvents, cleanup, hasDetectedNotes, subdiv, tokensToReadableText, transcribeFramesToSlots]);

    const startRecording = useCallback(async () => {
        setMicError('');
        setTranscribed([]);
        setTranscribedText('');
        setPlaybackEvents([]);
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioUrl('');
        }
        try {
            // Always mute app audio before opening the mic so drone/notes don't bleed in.
            // Mobile mode keeps echo cancellation for its noisier environment.
            muteAppAudio();
            const stream = mobileMicMode
                ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
                : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            streamRef.current = stream;
            if (typeof MediaRecorder !== 'undefined') {
                try {
                    const recorder = new MediaRecorder(stream);
                    audioChunksRef.current = [];
                    recorder.ondataavailable = (event) => {
                        if (event.data?.size) audioChunksRef.current.push(event.data);
                    };
                    recorder.onstop = () => {
                        if (!audioChunksRef.current.length) return;
                        const nextUrl = URL.createObjectURL(new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
                        setRecordedAudioUrl((prevUrl) => {
                            if (prevUrl) URL.revokeObjectURL(prevUrl);
                            return nextUrl;
                        });
                        audioChunksRef.current = [];
                        mediaRecorderRef.current = null;
                    };
                    recorder.start();
                    mediaRecorderRef.current = recorder;
                } catch {
                    mediaRecorderRef.current = null;
                }
            }

            const { ctx, analyser } = buildMicChain(stream, { fftSize: mobileMicMode ? 2048 : 4096, gain: 2.5 });
            recordingCtxRef.current = ctx;
            const sampleRate = ctx.sampleRate;
            analyserRef.current = analyser;

            const totalSlots = BEATS_PER_AVARTANA * subdiv * avartanas;
            bucketsRef.current = Array.from({ length: totalSlots }, () => ({}));
            frameHistoryRef.current = [];
            octaveStateRef.current = { stable: 0, pending: null, pendingCount: 0 };
            noiseProfileRef.current = 0.004;
            sustainBridgeRef.current = { label: ',', freqSemi: null, frames: 0 };

            const beatMs = (60 / bpm) * 1000;
            const slotMs = beatMs / subdiv;
            startTimeRef.current = performance.now();
            setPhase('recording');
            setCurrentBeat(1);
            setProgressPct(0);
            playTick(ctx, ctx.currentTime);

            let beatCounter = 1;
            beatTimerRef.current = setInterval(() => {
                beatCounter += 1;
                if (beatCounter > BEATS_PER_AVARTANA) beatCounter = 1;
                setCurrentBeat(beatCounter);
                playTick(ctx, ctx.currentTime);
            }, beatMs);

            intervalRef.current = setInterval(() => {
                const analyserNode = analyserRef.current;
                if (!analyserNode) return;

                const elapsed = performance.now() - startTimeRef.current;
                const slot = Math.floor(elapsed / slotMs);

                if (slot >= totalSlots) {
                    finishRecording();
                    return;
                }

                const progress = Math.min(100, (slot / totalSlots) * 100);
                setProgressPct(progress);

                const buf = new Float32Array(analyserNode.fftSize);
                analyserNode.getFloatTimeDomainData(buf);
                const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length);
                const noiseFloor = (window.MIC_NOISE_FLOOR || 4) / 100;
                const prev = frameHistoryRef.current[frameHistoryRef.current.length - 1];
                const prevLabel = prev?.label || ',';
                const recentNote = prevLabel !== ',';
                const prevWasStrong = !!prev?.strong;
                noiseProfileRef.current = recentNote
                    ? noiseProfileRef.current
                    : (noiseProfileRef.current * 0.92) + (rms * 0.08);
                const adaptiveFloor = noiseProfileRef.current;
                const rmsGate = mobileMicMode
                    ? Math.max(0.0048, noiseFloor * 0.27, adaptiveFloor * 1.65)
                    : Math.max(0.0052, noiseFloor * 0.3, adaptiveFloor * 1.9);
                const sustainGate = recentNote ? rmsGate * 0.64 : rmsGate;

                if (rms < sustainGate) {
                    if (recentNote && prevWasStrong && sustainBridgeRef.current.label === prevLabel && sustainBridgeRef.current.frames < 4 && rms >= sustainGate * 0.5) {
                        sustainBridgeRef.current = {
                            label: prevLabel,
                            freqSemi: prev?.freqSemi ?? sustainBridgeRef.current.freqSemi,
                            frames: sustainBridgeRef.current.frames + 1,
                        };
                        frameHistoryRef.current.push({
                            time: elapsed / 1000,
                            label: prevLabel,
                            glide: false,
                            freqSemi: prev?.freqSemi ?? sustainBridgeRef.current.freqSemi,
                            strong: false,
                            bridged: true,
                            hold: true,
                        });
                        const bucket = bucketsRef.current[slot];
                        bucket[prevLabel] = (bucket[prevLabel] || 0) + 1;
                        return;
                    }

                    sustainBridgeRef.current = { label: ',', freqSemi: null, frames: 0 };
                    frameHistoryRef.current.push({ time: elapsed / 1000, label: ',', glide: false, strong: false, bridged: false, hold: false });
                    return;
                }

                const yin = yinEstimate(buf, sampleRate);
                const acfFreq = detectPitchAudio(analyserNode, sampleRate);
                const yinPriorityThreshold = mobileMicMode ? 0.34 : 0.38;
                const minConfidence = mobileMicMode ? 0.22 : 0.25;
                const agreementCents = (yin?.freq && acfFreq)
                    ? Math.abs(1200 * Math.log2(yin.freq / acfFreq))
                    : null;
                const detectorsAgree = agreementCents == null ? false : agreementCents <= 70;
                let chosenFreq = null;
                let strongDetection = false;
                if (yin?.freq && yin.confidence >= yinPriorityThreshold && (detectorsAgree || !acfFreq)) {
                    chosenFreq = yin.freq;
                    strongDetection = true;
                } else if (acfFreq && yin?.freq && yin.confidence >= minConfidence && detectorsAgree) {
                    chosenFreq = (acfFreq + yin.freq) / 2;
                    strongDetection = true;
                } else if (acfFreq && rms >= rmsGate * 1.08) {
                    chosenFreq = acfFreq;
                    strongDetection = true;
                } else if (yin?.freq && yin.confidence >= minConfidence && rms >= rmsGate * 1.18) {
                    chosenFreq = yin.freq;
                }

                if (!chosenFreq) {
                    if (recentNote && prevWasStrong && sustainBridgeRef.current.label === prevLabel && sustainBridgeRef.current.frames < 4) {
                        sustainBridgeRef.current = {
                            label: prevLabel,
                            freqSemi: prev?.freqSemi ?? sustainBridgeRef.current.freqSemi,
                            frames: sustainBridgeRef.current.frames + 1,
                        };
                        frameHistoryRef.current.push({
                            time: elapsed / 1000,
                            label: prevLabel,
                            glide: false,
                            freqSemi: prev?.freqSemi ?? sustainBridgeRef.current.freqSemi,
                            strong: false,
                            bridged: true,
                            hold: true,
                        });
                        const bucket = bucketsRef.current[slot];
                        bucket[prevLabel] = (bucket[prevLabel] || 0) + 1;
                        return;
                    }

                    sustainBridgeRef.current = { label: ',', freqSemi: null, frames: 0 };
                    frameHistoryRef.current.push({ time: elapsed / 1000, label: ',', glide: false, strong: false, bridged: false, hold: false });
                    return;
                }

                const base = getSwaram(chosenFreq, sa);
                if (!base) {
                    sustainBridgeRef.current = { label: ',', freqSemi: null, frames: 0 };
                    frameHistoryRef.current.push({ time: elapsed / 1000, label: ',', glide: false, strong: false, bridged: false, hold: false });
                    return;
                }
                const semitones = 12 * (Math.log(chosenFreq / sa) / Math.log(2));
                const swara = resolveOctaveWithHysteresis(base, semitones);

                const prevSemi = prev?.freqSemi;
                const centsPerSec = prevSemi != null ? Math.abs((semitones - prevSemi) * 100) / Math.max(0.001, (elapsed / 1000) - prev.time) : 0;
                const glide = centsPerSec > 450; // fast continuous motion likely gamaka glide
                const isHeldContinuation = recentNote
                    && prevLabel === swara
                    && Math.abs((prevSemi ?? semitones) - semitones) < 0.18
                    && (!strongDetection || rms < rmsGate * 1.45);

                frameHistoryRef.current.push({
                    time: elapsed / 1000,
                    label: swara,
                    glide,
                    freqSemi: semitones,
                    strong: strongDetection,
                    bridged: false,
                    hold: isHeldContinuation,
                });
                sustainBridgeRef.current = { label: swara, freqSemi: semitones, frames: 0 };

                const bucket = bucketsRef.current[slot];
                const bucketLabel = (anchorOnlyMode && glide && prev?.label && prev.label !== ',') ? prev.label : swara;
                bucket[bucketLabel] = (bucket[bucketLabel] || 0) + 1;
            }, mobileMicMode ? 12 : 14);
        } catch {
            cleanup();
            setPhase('error');
            setMicError('Mic access is required for transcription.');
        }
    }, [BEATS_PER_AVARTANA, avartanas, bpm, cleanup, finishRecording, mobileMicMode, recordedAudioUrl, resolveOctaveWithHysteresis, sa, subdiv]);

    const stopTempoPreview = useCallback(() => {
        if (previewTimerRef.current) clearInterval(previewTimerRef.current);
        previewTimerRef.current = null;
        setIsPreviewingTempo(false);
        setCurrentBeat(0);
    }, []);

    const startTempoPreview = useCallback(() => {
        if (isPreviewingTempo || phase === 'countdown' || phase === 'recording') return;
        const ctx = getAudioCtx();
        const beatMs = (60 / bpm) * 1000;
        let beatCounter = 1;
        setIsPreviewingTempo(true);
        setCurrentBeat(beatCounter);
        playTick(ctx, ctx.currentTime);
        previewTimerRef.current = setInterval(() => {
            beatCounter += 1;
            if (beatCounter > BEATS_PER_AVARTANA) beatCounter = 1;
            setCurrentBeat(beatCounter);
            playTick(ctx, ctx.currentTime);
        }, beatMs);
    }, [BEATS_PER_AVARTANA, bpm, isPreviewingTempo, phase]);

    const startWithCountdown = useCallback(() => {
        stopTempoPreview();
        cleanup();
        setPhase('countdown');
        setCountdown(4);
        const ctx = getAudioCtx();
        const beatMs = Math.round((60 / bpm) * 1000);
        let c = 4;
        // Audible lead-in on "4"
        playTick(ctx, ctx.currentTime);
        const t = setInterval(() => {
            c -= 1;
            if (c <= 0) {
                clearInterval(t);
                startRecording();
            } else {
                // Audible count for 3,2,1
                playTick(ctx, ctx.currentTime);
                setCountdown(c);
            }
        }, beatMs);
    }, [bpm, cleanup, startRecording, stopTempoPreview]);

    const stopNow = useCallback(() => {
        cleanup();
        setPhase('idle');
        setCurrentBeat(0);
        setProgressPct(0);
    }, [cleanup]);

    const playTranscribed = useCallback(() => {
        if (!playbackEvents.length || isPlayingTranscription) return;
        const events = [...playbackEvents];
        if (!events.some((event) => event.type === 'note')) {
            setMicError('The transcription only contains rests or held space, so there is nothing playable yet.');
            return;
        }

        stopTranscriptionPlayback();
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const ctrl = new AbortController();
        playAbortRef.current = ctrl;
        setIsPlayingTranscription(true);
        const delayMs = Math.round((60 / bpm) * 1000);
        const unitSec = delayMs / 1000;
        let beatAcc = events[0]?.startBeat || 0;

        (async () => {
            for (const event of events) {
                if (ctrl.signal.aborted) return;

                const isBeatBoundary = Math.abs(beatAcc - Math.round(beatAcc)) < 0.01;
                if (talaSpec && isBeatBoundary) {
                    playTick(ctx, ctx.currentTime, 0.28);
                }

                if (event.type === 'rest') {
                    setPlayIdx(-1);
                    await new Promise((resolve) => setTimeout(resolve, event.duration * delayMs));
                    beatAcc += event.duration;
                    continue;
                }

                setPlayIdx(event.tokenIndex);
                const fallbackFreq = swaraFreq(event.swara, sa);
                const extDur = Math.max(0.09, Math.min(event.duration * unitSec * 0.94, 8));
                const contour = event.contour?.length
                    ? event.contour.map((point) => ({
                        at: Math.min(extDur, Math.max(0, point.at)),
                        freq: point.freq,
                    }))
                    : [{ at: 0, freq: fallbackFreq }];
                playContourTone(contour, extDur, {
                    fallbackFreq,
                    peakGain: 0.64,
                    sustainGain: 0.46,
                });
                await new Promise((resolve) => setTimeout(resolve, event.duration * delayMs));
                beatAcc += event.duration;
            }
        })().finally(() => {
            if (!ctrl.signal.aborted) {
                setIsPlayingTranscription(false);
                setPlayIdx(-1);
            }
        });
    }, [bpm, isPlayingTranscription, playbackEvents, sa, stopTranscriptionPlayback, talaSpec]);

    return (
        <div className="w-full max-w-4xl rounded-xl border border-c-border bg-c-surface p-5 flex flex-col gap-4">
            <h3 className="font-playfair text-xl text-c-gold">Tala Swara Transcriber</h3>
            <p className="text-xs text-c-cream-dim">Sing your own variation against your chosen tala and get swaras transcribed on a rhythmic grid.</p>

            <div className="grid sm:grid-cols-4 gap-3">
                <label className="text-xs text-c-cream-dim flex flex-col gap-1">Talam
                    <select value={talaId} onChange={e => setTalaId(e.target.value)} className="bg-c-card border border-c-border rounded px-2 py-1 text-c-cream">
                        {TALA_PRESETS.map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.groups.join(' + ')})</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs text-c-cream-dim flex flex-col gap-1">Tempo (BPM)
                    <input type="range" min="40" max="120" step="1" value={bpm} onChange={e => setBpm(Number(e.target.value))} />
                    <span className="font-mono text-c-gold">{bpm}</span>
                </label>
                <label className="text-xs text-c-cream-dim flex flex-col gap-1">Subdivisions / beat
                    <select value={subdiv} onChange={e => setSubdiv(Number(e.target.value))} className="bg-c-card border border-c-border rounded px-2 py-1 text-c-cream">
                        <option value={1}>1 (quarter)</option>
                        <option value={2}>2 (half-beat)</option>
                        <option value={4}>4 (chatusra)</option>
                        <option value={8}>8 (faster sangatis)</option>
                    </select>
                </label>
                <label className="text-xs text-c-cream-dim flex flex-col gap-1">Avartanas
                    <select value={avartanas} onChange={e => setAvartanas(Number(e.target.value))} className="bg-c-card border border-c-border rounded px-2 py-1 text-c-cream">
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={4}>4</option>
                    </select>
                </label>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-c-cream-dim">
                <input type="checkbox" checked={anchorOnlyMode} onChange={(e) => setAnchorOnlyMode(e.target.checked)} />
                Anchor Notes Only (reduce gamaka transition noise)
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-c-cream-dim">
                <input type="checkbox" checked={mobileMicMode} onChange={(e) => setMobileMicMode(e.target.checked)} />
                Mobile Mic Mode (better phone stability)
            </label>

            <div className="flex flex-wrap items-center gap-2 text-xs text-c-cream-dim">
                <span>Sa used for transcription:</span>
                <span className="px-2 py-1 rounded border border-c-gold/30 bg-c-gold/10 text-c-gold font-mono">{sa.toFixed(2)} Hz</span>
                <button onClick={() => setSa(Math.max(120, Number((sa - 1).toFixed(2))))} className="px-2 py-1 rounded border border-c-border hover:border-c-gold/50 text-c-cream">-1 Hz</button>
                <button onClick={() => setSa(Number((sa + 1).toFixed(2)))} className="px-2 py-1 rounded border border-c-border hover:border-c-gold/50 text-c-cream">+1 Hz</button>
                <span className="text-[10px] opacity-80">Tip: tune this first; wrong Sa shifts all note names.</span>
            </div>

            {phase === 'countdown' && <div className="text-c-gold font-mono text-lg">Starting in {countdown}…</div>}
            {phase === 'recording' && (
                <div className="flex flex-col gap-2">
                    <div className="text-xs text-c-cream">Recording... Beat <span className="text-c-gold font-mono">{currentBeat}</span> / {BEATS_PER_AVARTANA}</div>
                    <div className="w-full h-2 bg-c-bg rounded-full overflow-hidden">
                        <div className="h-full bg-c-gold transition-all duration-100" style={{ width: `${progressPct}%` }} />
                    </div>
                </div>
            )}
            {micError && <div className="text-xs text-red-400">{micError}</div>}

            <div className="flex gap-3">
                {(phase === 'idle' || phase === 'done' || phase === 'error') && (
                    <button onClick={startWithCountdown} className="px-5 py-2 rounded-full bg-c-gold text-c-bg font-playfair font-bold">Start Transcribing</button>
                )}
                {(phase === 'countdown' || phase === 'recording') && (
                    <button onClick={stopNow} className="px-5 py-2 rounded-full border border-red-700/40 text-red-400">Stop</button>
                )}
                {(phase === 'idle' || phase === 'done' || phase === 'error') && !isPreviewingTempo && (
                    <button onClick={startTempoPreview} className="px-5 py-2 rounded-full border border-c-border text-c-cream hover:border-c-gold/50">
                        🔊 Preview Tempo
                    </button>
                )}
                {isPreviewingTempo && (
                    <button onClick={stopTempoPreview} className="px-5 py-2 rounded-full border border-red-700/40 text-red-400">
                        ■ Stop Preview
                    </button>
                )}
                {transcribed.length > 0 && !isPlayingTranscription && (
                    <button onClick={playTranscribed} className="px-5 py-2 rounded-full border border-c-gold/40 text-c-gold hover:bg-c-gold hover:text-c-bg">
                        ▶ Play Transcription
                    </button>
                )}
                {isPlayingTranscription && (
                    <button onClick={stopTranscriptionPlayback} className="px-5 py-2 rounded-full border border-red-700/40 text-red-400">
                        ■ Stop Playback
                    </button>
                )}
            </div>

            {transcribed.length > 0 && (
                <div className="bg-c-card border border-c-border rounded-lg p-3 flex flex-col gap-2">
                    <div className="text-[10px] uppercase tracking-wider text-c-cream-dark font-mono">Transcribed Notation</div>
                    <div className="font-mono text-sm text-c-cream break-words">{transcribedText}</div>
                    {recordedAudioUrl && (
                        <div className="flex flex-col gap-1 pt-1">
                            <div className="text-[10px] uppercase tracking-wider text-c-cream-dark font-mono">Original Take</div>
                            <audio controls src={recordedAudioUrl} className="w-full max-w-md" />
                            <div className="text-[11px] text-c-cream-dim">Use this to compare your raw singing against the swara playback.</div>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {transcribed.map((t, i) => {
                            const s = getTokenSwara(t);
                            if (s === '|') return <span key={i} className="text-c-cream-dark">|</span>;
                            if (s === '||') return <span key={i} className="text-c-cream-dark">||</span>;
                            if (s === ',') return <span key={i} className="text-c-cream-dark">—</span>;
                            return (
                                <span
                                    key={i}
                                    className={`px-1.5 py-0.5 rounded border text-xs font-mono ${
                                        i === playIdx ? 'border-c-gold bg-c-gold text-c-bg' : 'border-c-border text-c-cream'
                                    }`}
                                >
                                    {s}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Raga Practice: browser ───────────────────────────────────────────────────

function RagaPractice({ sa, initialRaga }) {
    const [search, setSearch] = useState('');
    const allRagas = Object.entries(RAGAS);
    const [selected, setSelected] = useState(() => {
        if (!initialRaga) return null;
        const entry = allRagas.find(([name]) => name === initialRaga);
        return entry || null;
    });
    const [masteredRagas, setMasteredRagas] = useState([]);

    // If a new initialRaga is pushed in (navigation from workspace), jump straight to that raga
    useEffect(() => {
        if (!initialRaga) return;
        const entry = allRagas.find(([name]) => name === initialRaga);
        if (entry) setSelected(entry);
    }, [initialRaga]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const loadMastered = () => {
            try {
                const list = JSON.parse(localStorage.getItem('mastered_ragas') || '[]');
                setMasteredRagas(list);
            } catch {}
        };
        loadMastered();
        window.addEventListener('localStorage-mastered-ragas-updated', loadMastered);
        return () => window.removeEventListener('localStorage-mastered-ragas-updated', loadMastered);
    }, []);

    const filtered = allRagas.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()));

    if (selected) {
        return (
            <RagaSession
                ragaName={selected[0]}
                raga={selected[1]}
                sa={sa}
                onBack={() => setSelected(null)}
            />
        );
    }

    const colorMap = { maroon: '#5c1a0a', navy: '#0e2a4a', teal: '#0e3a36' };

    return (
        <div className="w-full max-w-4xl flex flex-col gap-4">
            <div className="bg-c-gold-faint border border-c-gold/30 p-3 rounded-lg flex gap-3 items-start mb-2">
                <svg className="w-4 h-4 text-c-gold mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <p className="text-xs text-c-cream-dim leading-relaxed">
                    This section is for users who are already well-versed and want to practice different raagams. Beginners should complete the Curriculum first!
                </p>
            </div>
            <input
                type="text"
                placeholder="Search ragas…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-c-surface border border-c-border rounded-full py-2 px-4 text-xs text-c-cream focus:outline-none focus:border-c-gold/60 transition-colors"
            />
            <div className="grid sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                {filtered.map(([name, data]) => {
                    const isMastered = masteredRagas.includes(name);
                    return (
                        <button key={name} onClick={() => setSelected([name, data])}
                                className={`text-left flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${
                                    isMastered 
                                    ? 'border-emerald-800/35 bg-emerald-900/[0.05] shadow-md shadow-emerald-900/5 hover:border-emerald-700' 
                                    : 'border-c-border bg-c-surface hover:border-c-gold/40'
                                }`}>
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-300 ${
                                isMastered 
                                ? 'bg-emerald-700 shadow-sm shadow-emerald-700/60 scale-110' 
                                : ''
                            }`} style={isMastered ? undefined : { background: colorMap[data.color] || '#5c1a0a' }} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-playfair text-sm truncate ${isMastered ? 'text-emerald-900 font-extrabold' : 'text-c-cream'}`}>{name}</span>
                                    {isMastered && (
                                        <span className="text-[9px] bg-emerald-800/10 text-emerald-800 border border-emerald-800/20 px-1.5 py-0.5 rounded-full font-sans tracking-wide uppercase flex items-center gap-0.5 select-none scale-90 font-bold">
                                            <span>🏆</span> Mastered
                                        </span>
                                    )}
                                </div>
                                <div className={`text-[10px] truncate ${isMastered ? 'text-emerald-800/70 font-semibold' : 'text-c-cream-dark'}`}>{data.type}{data.mood ? ` · ${data.mood}` : ''}</div>
                            </div>
                            <span className={`text-xs transition-colors ${isMastered ? 'text-emerald-800 font-bold' : 'text-c-cream-dark'}`}>→</span>
                        </button>
                    );
                })}
            </div>
            {filtered.length === 0 && (
                <p className="text-c-cream-dark text-sm font-playfair italic text-center py-8">No ragas match "{search}"</p>
            )}
        </div>
    );
}

export { TalaSwaraTranscriber, RagaPractice };
