import { useState, useRef, useEffect } from 'react';
import {
  detectPitch,
  startDrone,
  SWARA_SEMITONE,
  playNote,
  getOctaveSequence,
  playSequence,
  openMicStream,
  buildMicChain,
  closeMicStream,
  getAudioCtx,
} from '../utils/audioUtils';
import { getSwaram, toSargam } from '../utils/ragaLogic';
import { geminiChat } from '../utils/ragaIdentify';
import { deriveConfusedRaga, uniqueSwaras } from '../utils/practiceAnalytics';
const RECORD_SECS = 20;

const PITCHES = [
  { label: 'C',  hz: 261.63 }, { label: 'C#', hz: 277.18 },
  { label: 'D',  hz: 293.66 }, { label: 'D#', hz: 311.13 },
  { label: 'E',  hz: 329.63 }, { label: 'F',  hz: 349.23 },
  { label: 'F#', hz: 369.99 }, { label: 'G',  hz: 392.00 },
  { label: 'G#', hz: 415.30 }, { label: 'A',  hz: 440.00 },
  { label: 'A#', hz: 466.16 }, { label: 'B',  hz: 493.88 },
];

// ── Audio analysis helpers ───────────────────────────────────────────────────

function measureHarmonicRichness(analyser, fundamentalHz, sampleRate) {
  const fftData = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(fftData);
  const binHz = sampleRate / analyser.fftSize;
  const NOISE_FLOOR_DB = -75;
  let harmonicEnergy = 0;
  let totalEnergy = 0;
  fftData.forEach((db, i) => {
    if (db > NOISE_FLOOR_DB) {
      const lin = Math.pow(10, db / 20);
      totalEnergy += lin;
      const freq = i * binHz;
      for (let h = 1; h <= 5; h++) {
        if (Math.abs(freq - fundamentalHz * h) < binHz * 2.5) harmonicEnergy += lin;
      }
    }
  });
  return totalEnergy > 0 ? Math.min(1, harmonicEnergy / totalEnergy) : 0;
}

function oscillationHz(pitchWindow) {
  if (pitchWindow.length < 8) return 0;
  const mean = pitchWindow.reduce((a, b) => a + b, 0) / pitchWindow.length;
  let crossings = 0;
  for (let i = 1; i < pitchWindow.length; i++) {
    if ((pitchWindow[i] - mean) * (pitchWindow[i - 1] - mean) < 0) crossings++;
  }
  const durationSecs = pitchWindow.length * 0.05;
  return durationSecs > 0 ? (crossings / 2) / durationSecs : 0;
}

function alignSequence(detected, expected) {
  let eIdx = 0;
  const results = expected.map(n => ({ note: n, hit: false }));
  for (const note of detected) {
    if (eIdx >= expected.length) break;
    if (note === expected[eIdx]) { results[eIdx].hit = true; eIdx++; }
  }
  return results;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function RagaPracticePanel({ raga, initialSaHz = 293.66, compactMode = false, externalSaHz = null }) {
  const [saHz, setSaHz]         = useState(initialSaHz || 293.66);

  useEffect(() => {
    if (externalSaHz) setSaHz(externalSaHz);
  }, [externalSaHz]);

  const [droneOn, setDroneOn]   = useState(false);
  const [phase, setPhase]       = useState('idle');
  const [countdown, setCountdown] = useState(RECORD_SECS);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [liveNotes, setLiveNotes] = useState([]);
  const [playingNote, setPlayingNote] = useState(null);
  const [playingScale, setPlayingScale] = useState(false);
  const [livePitchHistory, setLivePitchHistory] = useState([]);

  const streamRef      = useRef(null);
  const recordingCtxRef = useRef(null);
  const droneStopRef   = useRef(null);
  const analysisRef    = useRef(null);
  const countdownRef   = useRef(null);
  const scaleTimeoutsRef = useRef([]);

  // Data collection
  const pitchHistRef    = useRef([]); // { swara, devCents, freq, time }
  const harmonicHist    = useRef([]); // harmonic richness per detected-pitch frame
  const rmsHist         = useRef([]); // RMS per frame
  const sequenceRef     = useRef([]); // committed distinct notes
  const candidateRef    = useRef(null);
  const candidateCt     = useRef(0);
  const silenceCt       = useRef(0);

  const cleanup = () => {
    clearInterval(analysisRef.current);
    clearInterval(countdownRef.current);
    scaleTimeoutsRef.current.forEach(clearTimeout);
    closeMicStream(streamRef.current, recordingCtxRef.current);
    streamRef.current = null;
    recordingCtxRef.current = null;
  };

  const stopDroneNow = () => { droneStopRef.current?.(); droneStopRef.current = null; setDroneOn(false); };

  const toggleDrone = () => {
    if (droneOn) { stopDroneNow(); return; }
    droneStopRef.current = startDrone(saHz, getAudioCtx());
    setDroneOn(true);
  };

  const changeSa = (hz) => {
    setSaHz(hz);
    if (droneOn) { droneStopRef.current?.(); droneStopRef.current = startDrone(hz, getAudioCtx()); }
  };

  useEffect(() => () => { cleanup(); stopDroneNow(); }, []);

  // ── Recording ────────────────────────────────────────────────────────────

  const startRecording = async () => {
    cleanup();
    setErrorMsg('');
    setFeedback('');
    setLiveNotes([]);
    setLivePitchHistory([]);
    pitchHistRef.current  = [];
    harmonicHist.current  = [];
    rmsHist.current       = [];
    sequenceRef.current   = [];
    candidateRef.current  = null;
    candidateCt.current   = 0;
    silenceCt.current     = 0;

    try {
      const stream = await openMicStream();
      streamRef.current = stream;
      const { ctx, analyser } = buildMicChain(stream);
      recordingCtxRef.current = ctx;

      setPhase('recording');
      setCountdown(RECORD_SECS);

      let remaining = RECORD_SECS;
      countdownRef.current = setInterval(() => {
        remaining--;
        setCountdown(remaining);
        if (remaining <= 0) stopAndAnalyze();
      }, 1000);

      analysisRef.current = setInterval(() => {
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        rmsHist.current.push(rms);

        const isSinging = rms * 1200 > 5;
        let activeFreq = 0;
        let activeSwara = '';

        if (isSinging) {
          const freq = detectPitch(analyser, ctx.sampleRate);
          if (freq && freq >= 80 && freq <= 800) {
            const swara = getSwaram(freq, saHz);
            if (swara) {
              activeFreq = freq;
              activeSwara = swara;
              const targetFreq = saHz * Math.pow(2, (SWARA_SEMITONE[swara] ?? 0) / 12);
              const devCents = 1200 * Math.log2(freq / targetFreq);
              pitchHistRef.current.push({ swara, devCents, freq, time: Date.now() });
              harmonicHist.current.push(measureHarmonicRichness(analyser, freq, ctx.sampleRate));

              silenceCt.current = 0;
              if (swara === candidateRef.current) {
                candidateCt.current++;
              } else {
                candidateRef.current = swara;
                candidateCt.current = 1;
              }
              if (candidateCt.current === 3) {
                const last = sequenceRef.current[sequenceRef.current.length - 1];
                if (last !== swara) {
                  sequenceRef.current.push(swara);
                  setLiveNotes([...sequenceRef.current].slice(-7));
                }
              }
            }
          }
        }

        if (!activeFreq) {
          silenceCt.current++;
          if (silenceCt.current >= 4) { candidateRef.current = null; candidateCt.current = 0; }
        }

        setLivePitchHistory(prev => {
          const next = [...prev, { freq: activeFreq, swara: activeSwara, time: Date.now() }];
          if (next.length > 50) return next.slice(-50);
          return next;
        });
      }, 50);
    } catch {
      setErrorMsg('Microphone access required. Please allow mic and try again.');
      setPhase('error');
    }
  };

  const stopAndAnalyze = () => { cleanup(); doAnalyze(); };

  // ── Analysis + Groq ──────────────────────────────────────────────────────

  const doAnalyze = async () => {
    setPhase('processing');
    try {
      const samples = pitchHistRef.current;
      if (samples.length < 10) throw new Error('Not enough audio detected. Sing clearly into your microphone and try again.');

      // 1. Per-note intonation stats
      const noteGroups = {};
      samples.forEach(({ swara, devCents }) => {
        if (!noteGroups[swara]) noteGroups[swara] = [];
        noteGroups[swara].push(devCents);
      });
      const intonation = Object.fromEntries(
        Object.entries(noteGroups).map(([note, devs]) => {
          const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
          const stdDev = Math.sqrt(devs.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / devs.length);
          return [note, {
            avgDev: Math.round(avg),
            stability: stdDev < 15 ? 'stable' : stdDev < 35 ? 'slightly wavering' : 'unstable',
          }];
        })
      );

      // 2. Sequence alignment
      const detected = sequenceRef.current;

      const formatAlignment = (aligned) => aligned.map(({ note, hit }) => {
        if (!hit) return `- ${note}: ✗ missed`;
        const s = intonation[note];
        if (!s) return `- ${note}: ✓ hit`;
        const sign = s.avgDev >= 0 ? '+' : '';
        const tuning = Math.abs(s.avgDev) <= 15 ? 'in tune' : s.avgDev > 0 ? 'sharp' : 'flat';
        return `- ${note}: ✓ hit · ${sign}${s.avgDev}¢ (${tuning}) · ${s.stability}`;
      }).join('\n');

      const aroAligned = alignSequence(detected, expectedAro);
      const avaAligned = alignSequence(detected, expectedAva);
      const aroStr = formatAlignment(aroAligned);
      const avaStr = formatAlignment(avaAligned);
      const allAligned = [...aroAligned, ...avaAligned];
      const totalTargets = allAligned.length || 1;
      const hitCount = allAligned.filter(item => item.hit).length;
      const hitRate = hitCount / totalTargets;
      const missedNotes = uniqueSwaras(allAligned.filter(item => !item.hit).map(item => item.note));
      const practiceOutcome =
        hitRate >= 0.72 ? 'identified' :
        hitRate >= 0.45 ? 'likely' :
        'ambiguous';
      const confusedWith = deriveConfusedRaga(raga.name, raga, detected, missedNotes);

      // 3. Harmonic richness → resonance
      const harmArr = harmonicHist.current;
      const avgHarmonic = harmArr.length > 0 ? harmArr.reduce((a, b) => a + b, 0) / harmArr.length : 0;
      const resonanceLabel = avgHarmonic > 0.55 ? 'resonant and open'
        : avgHarmonic > 0.35 ? 'moderately resonant'
        : 'thin or constricted — voice may be tight';

      // 4. Breath support (RMS envelope shape)
      const rmsArr = rmsHist.current;
      let breathLabel = 'steady';
      if (rmsArr.length > 20) {
        const cut = Math.floor(rmsArr.length * 0.75);
        const earlyAvg = rmsArr.slice(0, cut).reduce((a, b) => a + b, 0) / cut;
        const lateAvg  = rmsArr.slice(cut).reduce((a, b) => a + b, 0) / (rmsArr.length - cut);
        const variance  = rmsArr.reduce((a, v) => a + Math.pow(v - earlyAvg, 2), 0) / rmsArr.length;
        if (lateAvg < earlyAvg * 0.5)  breathLabel = 'fading — voice dropped toward the end, likely breath support issue';
        else if (variance > 0.0008)     breathLabel = 'slightly inconsistent — some volume fluctuation detected';
        else                            breathLabel = 'steady and well-supported throughout';
      }

      // 5. Gamakam / oscillation per note segment
      const gamakamNotes = [];
      let segStart = 0;
      for (let i = 1; i <= samples.length; i++) {
        const ended = i === samples.length || samples[i]?.swara !== samples[segStart].swara;
        if (ended) {
          if (i - segStart >= 8) {
            const hz = oscillationHz(samples.slice(segStart, i).map(s => s.freq));
            if (hz >= 3.5 && hz <= 9) gamakamNotes.push(`${samples[segStart].swara} (${hz.toFixed(1)} Hz)`);
          }
          segStart = i;
        }
      }
      const ornamentLabel = gamakamNotes.length > 0
        ? `Oscillation detected on: ${gamakamNotes.join(', ')} — possible kampita gamakam`
        : 'No clear ornamentation detected';

      // 6. Groq prompt
      const PROMPT = `You are an expert classical Carnatic vocal teacher evaluating a student who already has a foundation and is now deepening their practice of the raga ${raga.name}.

RAGA: ${raga.name}
Arohanam: ${expectedAro.join(' ')}
Avarohanam: ${expectedAva.join(' ')}
${raga.description ? `Character: ${raga.description}` : ''}

AROHANAM ACCURACY:
${aroStr}

AVAROHANAM ACCURACY:
${avaStr}

VOICE QUALITY:
- Resonance: ${resonanceLabel} (harmonic richness: ${(avgHarmonic * 100).toFixed(0)}%)
- Breath Support: ${breathLabel}
- Ornamentation: ${ornamentLabel}

Respond in plain prose — exactly 3 short paragraphs, max 200 words total. Do NOT use JSON, bullet points, or headers.
1. Note accuracy — which notes they nailed, which were consistently flat or sharp, which they missed. Be specific.
2. Voice quality — address the resonance and breath support using proper Carnatic terms (akaram, gamakam, shruti, swarasthana). If ornamentation was detected, comment on whether it was clean.
3. One precise, actionable tip for their next practice session.

Tone: warm but direct. Address them as a serious student. Do not mention numbers or cents.`;

      const data = await geminiChat({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: PROMPT }],
        temperature: 0.65,
      });
      const raw = data.choices[0]?.message?.content || 'No feedback generated.';
      // Model sometimes returns JSON despite prose instruction — convert common
      // structured shapes back into readable guru prose.
      let parsed = raw;
      if (raw.trimStart().startsWith('{')) {
        try {
          const obj = JSON.parse(raw);
          if (obj.evaluation || obj.feedback || obj.summary) {
            parsed = obj.evaluation || obj.feedback || obj.summary || raw;
          } else if (obj.notes_accuracy || obj.voice_quality || obj.actionable_tip) {
            parsed = [
              obj.notes_accuracy ? `Namaste, dear student. ${obj.notes_accuracy}` : null,
              obj.voice_quality ? obj.voice_quality : null,
              obj.actionable_tip ? `For your next practice: ${obj.actionable_tip}` : null,
            ].filter(Boolean).join('\n\n');
          }
        } catch { /* keep raw */ }
      }
      setFeedback(parsed);

      // Save evaluated learner behavior from AI Guru practice, not classifier ambiguity.
      window.__alapanaCoach?.saveSession({
        tool: 'tutor',
        raga: raga.name,
        outcome: practiceOutcome,
        confidence: hitRate >= 0.72 ? 'high' : hitRate >= 0.45 ? 'medium' : 'low',
        swarasFocused: missedNotes,
        ...(confusedWith ? { confusedWith } : {}),
      });

      setPhase('result');
    } catch (err) {
      setErrorMsg(err.message || 'Error generating feedback.');
      setPhase('error');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const currentPitch = PITCHES.find(p => Math.abs(p.hz - saHz) < 1);
  const progressPct  = Math.round(((RECORD_SECS - countdown) / RECORD_SECS) * 100);

  const clean = arr => arr.filter(n => n !== '|' && n !== '||');
  const expectedAro = clean(raga.arohanam);
  const expectedAva = clean(raga.avarohanam);

  const aroOctaves = getOctaveSequence(expectedAro);
  const avaOctaves = getOctaveSequence([...expectedAro, ...expectedAva]).slice(expectedAro.length);

  const handleNotePlay = (note, octaveShift = 0) => {
    const ctx = getAudioCtx();
    const durationMs = playNote(note, saHz, ctx, { octaveShift });
    setPlayingNote({ note, octaveShift });
    setTimeout(() => setPlayingNote(null), durationMs);
  };

  const handlePlayScale = async () => {
    if (playingScale) return;
    setPlayingScale(true);
    scaleTimeoutsRef.current.forEach(clearTimeout);
    scaleTimeoutsRef.current = [];

    const sequence = [...expectedAro, ...expectedAva];
    const octaves = getOctaveSequence(sequence);

    const { promise, abort } = playSequence(sequence, saHz, {
      gapMs: 600,
      duration: 0.5,
      gamakam: false,
      onNote: (note, idx) => setPlayingNote({ note, octaveShift: octaves[idx] }),
    });
    scaleTimeoutsRef.current.push(abort);
    try { await promise; } catch (e) {}
    setPlayingNote(null);
    setPlayingScale(false);
  };

  const NoteKey = ({ note, octaveShift = 0 }) => {
    const isPlaying = playingNote?.note === note && playingNote?.octaveShift === octaveShift;
    const isSpecial = note === 'Sa' || note === 'Pa';
    const sargam = toSargam ? toSargam(note) : note;

    return (
      <button
        onMouseDown={() => handleNotePlay(note, octaveShift)}
        onTouchStart={(e) => { e.preventDefault(); handleNotePlay(note, octaveShift); }}
        className={[
          'flex flex-col items-center justify-center',
          'w-11 h-12 rounded border select-none cursor-pointer',
          'transition-all duration-100 active:scale-95',
          'font-playfair',
          isPlaying
            ? 'bg-c-gold border-c-gold text-c-bg scale-95 shadow-inner'
            : isSpecial
            ? 'bg-c-gold-faint border-c-gold text-c-gold'
            : 'bg-c-card border-c-border text-c-cream hover:bg-c-surface hover:border-c-gold',
        ].join(' ')}
      >
        <span className="text-sm font-bold leading-none mb-1">{sargam}</span>
        <span className="text-[9px] opacity-70 leading-none">{note}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Sa selector */}
      {!compactMode && (
        <div className="bg-c-surface border border-c-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-playfair text-c-cream-dim italic">Set your Sa (root note)</span>
            <span className="font-mono text-xs text-c-gold">{currentPitch?.label ?? '—'} · {Math.round(saHz)} Hz</span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
            {PITCHES.map(p => {
              const sel = Math.abs(p.hz - saHz) < 1;
              const isSharp = p.label.includes('#');
              return (
                <button
                  key={p.label}
                  onClick={() => changeSa(p.hz)}
                  className={`py-2 rounded text-[10px] font-mono font-bold transition-all ${
                    sel
                      ? 'bg-c-gold text-c-bg border border-c-gold'
                      : isSharp
                      ? 'bg-c-bg border border-c-border text-c-cream-dark hover:border-c-gold/40'
                      : 'bg-c-surface border border-c-border text-c-cream hover:border-c-gold/40'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Drone toggle */}
      {!compactMode && (
        <button
          onClick={toggleDrone}
          disabled={phase === 'recording' || phase === 'processing'}
          className={`flex items-center gap-2 self-start px-4 py-2 rounded-full border text-xs font-playfair transition-all disabled:opacity-40 ${
            droneOn
              ? 'border-c-gold bg-c-gold/10 text-c-gold'
              : 'border-c-border text-c-cream-dark hover:border-c-gold/40'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${droneOn ? 'bg-c-gold animate-pulse' : 'bg-c-cream-dark'}`} />
          {droneOn ? 'Drone playing — click to stop' : 'Play drone while you sing (recommended)'}
        </button>
      )}

      {/* Idle / Practice setup */}
      {phase === 'idle' && (
        <div className="flex flex-col gap-6 py-2">
          {!compactMode && (
            <div className="space-y-4 border border-c-gold/20 rounded-xl p-4 bg-c-card/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-playfair font-bold text-c-gold uppercase tracking-widest">Arohanam</span>
                <button
                  onClick={handlePlayScale}
                  disabled={playingScale}
                  className="px-4 py-1.5 border border-c-gold/40 hover:border-c-gold text-c-gold text-[10px] rounded-full transition-all font-playfair tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {playingScale ? (
                    <><span className="w-1.5 h-1.5 rounded-full bg-c-gold animate-pulse" /> Playing…</>
                  ) : '▶ Play Full Scale'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {expectedAro.map((note, idx) => (
                  <NoteKey key={`aro-${idx}`} note={note} octaveShift={aroOctaves[idx]} />
                ))}
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-xs font-playfair font-bold text-c-gold uppercase tracking-widest">Avarohanam</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {expectedAva.map((note, idx) => (
                  <NoteKey key={`ava-${idx}`} note={note} octaveShift={avaOctaves[idx]} />
                ))}
              </div>
            </div>
          )}

          <div className={`flex flex-col items-center gap-4 py-2 ${compactMode ? '' : 'border-t border-c-border pt-6'}`}>
            <h4 className="font-playfair text-c-gold text-lg font-bold mb-1">Practice with AI Guru</h4>
            <p className="text-xs text-c-cream-dim font-playfair italic text-center max-w-sm leading-relaxed mb-2">
              Sing the arohanam and avarohanam of {raga.name} at your own pace. The AI Guru will listen to 6 key elements of your singing—pitch accuracy, intonation stability, shruthi alignment, resonance, breath support, and gamakam—and provide personalized feedback. Recording is {RECORD_SECS} seconds.
            </p>
            <div className="flex flex-wrap justify-center gap-3 w-full max-w-xs">
              <button
                onClick={startRecording}
                className={`${compactMode ? 'w-full' : 'w-48'} py-3 bg-c-gold hover:bg-c-gold-light text-c-bg font-bold text-xs rounded transition-all font-playfair tracking-wide shadow-md transform hover:scale-105 active:scale-95`}
              >
                Start Recording
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recording */}
      {phase === 'recording' && (
        <div className="flex flex-col items-center gap-4 py-2 w-full">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-c-cream text-sm font-playfair italic">Recording…</span>
            <span className="font-mono text-c-gold text-sm tabular-nums">{countdown}s</span>
          </div>
          <div className="w-full h-1 bg-c-border rounded-full overflow-hidden">
            <div className="h-full bg-c-gold transition-all duration-1000 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Scrolling Pitch Ribbon SVG */}
          <div className="w-full bg-c-card/40 border border-c-border/30 rounded-xl p-4 shadow-inner relative overflow-hidden mt-1 backdrop-blur-sm">
            <span className="absolute top-2.5 left-3 text-[9px] uppercase tracking-widest text-c-gold/60 font-mono z-10">Live Pitch Ribbon</span>
            <svg viewBox="0 0 400 120" className="w-full h-[120px] overflow-visible">
              {/* Guidelines for expected swaras in the scale */}
              {(() => {
                const uniqueNotes = Array.from(new Set([...expectedAro, ...expectedAva]));
                return uniqueNotes.map((note) => {
                  const semi = SWARA_SEMITONE[note] ?? 0;
                  const y = 100 - (semi / 12) * 85; // Map relative semitones up to octave Sa (12 semitones)
                  if (y < 5 || y > 115) return null;
                  const sargam = toSargam ? toSargam(note) : note;
                  return (
                    <g key={note}>
                      <line 
                        x1="35" y1={y} x2="400" y2={y} 
                        stroke="#b88014" strokeWidth="0.5" strokeDasharray="3,3" className="opacity-30" 
                      />
                      <text 
                        x="5" y={y + 3} 
                        fill="#f7d686" className="font-playfair text-[9px] font-bold opacity-75"
                      >
                        {sargam}
                      </text>
                    </g>
                  );
                });
              })()}

              {/* Scrolling pitch wave path */}
              {(() => {
                const points = [];
                livePitchHistory.forEach((pt, idx) => {
                  if (pt.freq > 0) {
                    let freq = pt.freq;
                    // Octave folding: gracefully bring frequency into the primary visual octave bounds.
                    // Allows low-pitched singers to see their trace perfectly mapped to the relative swara guides.
                    while (freq < saHz * 0.7) freq *= 2;
                    while (freq > saHz * 1.9) freq /= 2;

                    const semi = 12 * Math.log2(freq / saHz);
                    const x = 40 + (idx / 50) * 350;
                    const y = 100 - (semi / 12) * 85;
                    
                    // Relaxed bounds to allow Mandra sthayi (lower octave) to render
                    if (y >= -50 && y <= 200) {
                      points.push(`${x},${y}`);
                    }
                  }
                });

                if (points.length < 2) return null;
                const pathData = `M ${points.join(' L ')}`;
                const lastPoint = points[points.length - 1].split(',');

                return (
                  <g>
                    {/* Glowing background path */}
                    <path 
                      d={pathData} 
                      fill="none" stroke="#f7d686" strokeWidth="3" 
                      className="opacity-20 blur-sm" 
                    />
                    {/* Sharp foreground path */}
                    <path 
                      d={pathData} 
                      fill="none" stroke="#c8941f" strokeWidth="1.8" 
                      strokeLinecap="round" strokeLinejoin="round" 
                    />
                    {/* Current location pulsing cursor */}
                    {lastPoint && (
                      <circle 
                        cx={lastPoint[0]} cy={lastPoint[1]} r="3.5" 
                        fill="#f7d686" className="animate-pulse shadow-md"
                        style={{ filter: 'drop-shadow(0 0 6px #c8941f)' }}
                      />
                    )}
                  </g>
                );
              })()}
            </svg>
          </div>

          <div className="h-5 flex items-center justify-center w-full mt-1">
            <p className="text-[11px] text-c-cream-dim tracking-widest">
              {liveNotes.length > 0 ? liveNotes.join(' · ') : 'Listening…'}
            </p>
          </div>
          <button
            onClick={stopAndAnalyze}
            className="text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2 mt-1"
          >
            Done early · analyze now
          </button>
        </div>
      )}

      {/* Processing */}
      {phase === 'processing' && (
        <div className="flex flex-col items-center gap-3 py-6">
          <div className="w-5 h-5 border-2 border-c-gold/30 border-t-c-gold rounded-full animate-spin" />
          <p className="text-c-cream-dark text-xs font-playfair italic">Analyzing your performance…</p>
        </div>
      )}

      {/* Result */}
      {phase === 'result' && feedback && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="border border-c-gold/20 rounded-xl p-5 bg-c-surface">
            <h4 className="font-playfair text-c-gold text-sm font-bold mb-3 flex items-center gap-2">
              <span className="text-c-gold/50">✦</span> Guru Feedback
            </h4>
            <div className="text-xs text-c-cream-dim font-playfair leading-relaxed space-y-3">
              {feedback.split('\n').filter(l => l.trim()).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setPhase('idle'); setFeedback(''); stopDroneNow(); }}
            className="self-center text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2 font-playfair italic"
          >
            Practice again
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-red-400 text-center font-playfair italic max-w-xs">{errorMsg}</p>
          <button onClick={() => setPhase('idle')} className="text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2">Try again</button>
        </div>
      )}
    </div>
  );
}
