import React from 'react';
import {
    getAudioCtx,
    SWARA_SEMITONE,
    noteFreq,
    getOctaveSequence,
} from '../../utils/audioUtils';

const GurukulIcon = ({ className = "w-5 h-5" }) => (
    <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
        {/* Temple Arch / Aureole (Prabhavali) */}
        <path d="M12 52C12 28 20 12 32 12C44 12 52 28 52 52" strokeWidth="2" stroke="currentColor" opacity="0.8" />
        <path d="M8 56C8 24 18 8 32 8C46 8 56 24 56 56" strokeWidth="1" stroke="currentColor" opacity="0.4" strokeDasharray="3 3" />
        
        {/* Traditional Lighted Diya (Oil Lamp) symbolizing classical knowledge */}
        <path d="M18 46C18 51.5 24.3 56 32 56C39.7 56 46 51.5 46 46C46 46 41 46 32 46C23 46 18 46 18 46Z" fill="currentColor" fillOpacity="0.15" strokeWidth="1.8" />
        <path d="M32 46C32 46 36 43 36 39C36 35 32 30 32 30C32 30 28 35 28 39C28 43 32 46 32 46Z" fill="currentColor" className="text-c-gold animate-pulse" />
        
        {/* Radiating sound rays of wisdom */}
        <line x1="32" y1="25" x2="32" y2="20" stroke="currentColor" strokeWidth="1.5" />
        <line x1="22" y1="29" x2="18" y2="26" stroke="currentColor" strokeWidth="1.5" />
        <line x1="42" y1="29" x2="46" y2="26" stroke="currentColor" strokeWidth="1.5" />
        
        {/* Base steps */}
        <rect x="6" y="56" width="52" height="4" rx="2" fill="currentColor" strokeWidth="1" />
    </svg>
);

// ─── Audio helpers (thin wrappers over audioUtils) ────────────────────────────

// Extended semitone map including upper-octave Sa for sing exercises
const SEMITONES = { ...SWARA_SEMITONE, 'Ṡ': 12 };

const swaraFreq = (swara, sa) => noteFreq(swara === 'Ṡ' ? 'Sa' : swara, sa) * (swara === 'Ṡ' ? 2 : 1);

const getTokenSwara = (token) => typeof token === 'string' ? token : token?.swara;
const getTokenDuration = (token) => typeof token === 'object' && token?.duration ? token.duration : 1;
const getTokenNotationSuffix = (token) => typeof token === 'object' ? (token.notationSuffix || []) : [];
const isBarToken = (token) => getTokenSwara(token) === '|' || getTokenSwara(token) === '||';
const getPlainSwaras = (tokens) => tokens.map(getTokenSwara);
const getTotalUnits = (tokens) => tokens.reduce((sum, token) => sum + (isBarToken(token) ? 0 : getTokenDuration(token)), 0);
const parseDisplaySwara = (swara = '') => {
    let base = swara;
    let upperDot = false;
    let lowerDot = false;

    if (base.endsWith('^')) {
        upperDot = true;
        base = base.slice(0, -1);
    }
    if (base.endsWith('.')) {
        lowerDot = true;
        base = base.slice(0, -1);
    }

    if (base === 'Ṡ') {
        base = 'Sa';
        upperDot = true;
    }

    return { base, upperDot, lowerDot };
};

const renderNotationLabel = (swara, suffix = [], compact = false) => {
    const { base, upperDot, lowerDot } = parseDisplaySwara(swara);
    const dotSize = compact ? 'w-1 h-1' : 'w-1.5 h-1.5';
    const topOffset = compact ? '-top-1.5' : '-top-2';
    const bottomOffset = compact ? '-bottom-1.5' : '-bottom-2';

    return (
        <span className="inline-flex items-center justify-center gap-0.5 leading-none">
            <span className="relative inline-flex items-center justify-center px-0.5">
                {upperDot && (
                    <span className={`absolute ${topOffset} left-1/2 -translate-x-1/2 rounded-full bg-c-gold ${dotSize}`} />
                )}
                <span>{base}</span>
                {lowerDot && (
                    <span className={`absolute ${bottomOffset} left-1/2 -translate-x-1/2 rounded-full bg-c-gold ${dotSize}`} />
                )}
            </span>
            {suffix.length > 0 && (
                <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-c-gold-light tracking-tight`}>
                    {suffix.join('')}
                </span>
            )}
        </span>
    );
};

const splitSwarasIntoBeatGroups = (swaras = []) => {
    const beats = [];
    let current = [];
    let durSum = 0;
    swaras.forEach((token) => {
        const swara = getTokenSwara(token);
        if (swara === '|' || swara === '||') {
            return;
        }
        current.push(token);
        durSum += getTokenDuration(token);
        if (durSum >= 0.999) {
            beats.push(current);
            current = [];
            durSum = 0;
        }
    });
    if (current.length) beats.push(current);
    return beats;
};

const flattenLyricsInput = (lyrics = []) => (
    lyrics.flatMap((line) => Array.isArray(line) ? line : [line]).filter(Boolean)
);

function SahityaBeatMap({ swaras = [], lyricsBeats = [], tala, compact = false, activeBeat = -1 }) {
    const beats = React.useMemo(() => splitSwarasIntoBeatGroups(swaras), [swaras]);
    const gapClass = compact ? 'gap-2' : 'gap-3';
    const beatWidth = compact ? 'min-w-[92px]' : 'min-w-[110px]';
    const noteGap = compact ? 'gap-1' : 'gap-1.5';
    const textClass = compact ? 'text-[11px]' : 'text-xs';
    const beatsPerCycle = tala?.groups?.reduce((sum, group) => sum + group, 0) || 0;
    const totalCycles = beatsPerCycle ? Math.ceil(beats.length / beatsPerCycle) : 1;

    return (
        <div className={`flex flex-wrap justify-center ${gapClass} w-full`}>
            {beats.map((beat, idx) => (
                <React.Fragment key={idx}>
                    {beatsPerCycle > 0 && idx > 0 && idx % beatsPerCycle === 0 && (
                        <div className="basis-full h-0" aria-hidden="true" />
                    )}
                    <div
                        className={`${beatWidth} rounded-xl border px-2 py-2 flex flex-col gap-2 transition-all ${
                            idx === activeBeat
                                ? 'border-c-gold bg-c-gold/10 shadow-[0_0_12px_rgba(200,148,31,0.18)]'
                                : 'border-c-border/40 bg-c-card'
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-c-cream-dark">
                                Beat {beatsPerCycle ? ((idx % beatsPerCycle) + 1) : (idx + 1)}
                            </span>
                            {beatsPerCycle > 0 && totalCycles > 1 ? (
                                <span className="text-[9px] font-mono text-c-gold/70">
                                    Cycle {Math.floor(idx / beatsPerCycle) + 1}
                                </span>
                            ) : null}
                        </div>
                        <div className={`flex flex-wrap items-center justify-center ${noteGap}`}>
                            {beat.map((token, tokenIdx) => {
                                const s = getTokenSwara(token);
                                const suffix = getTokenNotationSuffix(token);
                                const duration = getTokenDuration(token);
                                if (s === ',') {
                                    return (
                                        <span key={tokenIdx} className="inline-flex items-center justify-center px-2 text-c-gold/70">
                                            <span className="block h-[2px] w-5 rounded-full bg-c-gold/55" />
                                        </span>
                                    );
                                }
                                return (
                                    <span
                                        key={tokenIdx}
                                        className={`inline-flex items-center justify-center rounded-md border border-c-border/40 px-2 py-1 font-mono ${textClass} text-c-cream`}
                                        style={duration > 0 ? { minWidth: `${Math.max(32, duration * 28)}px` } : undefined}
                                    >
                                        {renderNotationLabel(s.replace(/[0-9]/g, ''), suffix, true)}
                                    </span>
                                );
                            })}
                        </div>
                        <div className="rounded-lg bg-c-bg/55 px-2 py-1.5 min-h-[44px] flex items-center justify-center text-center">
                            <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-playfair text-c-cream leading-snug`}>
                                {lyricsBeats[idx] || '—'}
                            </span>
                        </div>
                    </div>
                </React.Fragment>
            ))}
        </div>
    );
}

function TalaBadge({ tala, swaras }) {
    if (!tala) return null;
    const units = getTotalUnits(swaras);
    return (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-wider text-c-cream-dark">
            <span className="px-2 py-1 rounded border border-c-gold/30 bg-c-gold/10 text-c-gold">
                Tāḷam: {tala.name}
            </span>
            {tala.groups && (
                <span className="px-2 py-1 rounded border border-c-border bg-c-card">
                    {tala.groups.join(' + ')} · {tala.unitLabel}
                </span>
            )}
            <span className="px-2 py-1 rounded border border-c-border bg-c-card">
                {units} rhythmic units
            </span>
        </div>
    );
}

const playSingleTone = (freq, duration = 0.7, prevFreq = null) => {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        // Use raw oscillator approach for the tutor's simpler sound
        const master = ctx.createGain();
        master.connect(ctx.destination);
        const harmonics = [1, 2, 3, 4, 5, 6, 7];
        const amps      = [0.48, 0.26, 0.14, 0.07, 0.03, 0.015, 0.008];
        const now = ctx.currentTime;
        
        harmonics.forEach((mult, i) => {
            const osc = ctx.createOscillator();
            const g   = ctx.createGain();
            osc.type = 'sine';
            
            if (prevFreq) {
                // Soulful Carnatic legato slide (Jaaru) from previous note to current note!
                const startFreq = prevFreq * mult;
                const targetFreq = freq * mult;
                osc.frequency.setValueAtTime(startFreq, now);
                osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.20);
            } else {
                osc.frequency.setValueAtTime(freq * mult, now);
            }
            
            g.gain.value = amps[i];
            osc.connect(g);
            g.connect(master);
            osc.start();
            osc.stop(now + duration);
        });
        master.gain.setValueAtTime(0, now);
        master.gain.linearRampToValueAtTime(0.28, now + 0.07);
        master.gain.setValueAtTime(0.28, now + Math.max(0.07, duration - 0.12));
        master.gain.linearRampToValueAtTime(0, now + duration);
    } catch (err) {
        console.warn('Tutor playTone failed:', err);
    }
};

const scheduleContour = (param, contour, now, duration, fallbackFreq) => {
    const usable = Array.isArray(contour) && contour.length
        ? contour
            .filter((point) => Number.isFinite(point?.freq) && Number.isFinite(point?.at))
            .sort((a, b) => a.at - b.at)
        : [];
    const initialFreq = usable[0]?.freq || fallbackFreq;
    param.setValueAtTime(initialFreq, now);
    usable.forEach((point) => {
        const clampedAt = Math.max(0, Math.min(duration, point.at));
        param.linearRampToValueAtTime(point.freq, now + clampedAt);
    });
    if (!usable.length) {
        param.setValueAtTime(fallbackFreq, now);
    } else if (usable[usable.length - 1].at < duration) {
        param.linearRampToValueAtTime(usable[usable.length - 1].freq, now + duration);
    }
};

const playContourTone = (contour, duration = 0.7, options = {}) => {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        const baseFreq = contour?.[0]?.freq || options.fallbackFreq || 220;
        const now = ctx.currentTime;

        const master = ctx.createGain();
        const toneBus = ctx.createGain();
        const toneFilter = ctx.createBiquadFilter();
        const airFilter = ctx.createBiquadFilter();

        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(2200, now);
        toneFilter.Q.setValueAtTime(0.5, now);

        airFilter.type = 'bandpass';
        airFilter.frequency.setValueAtTime(1900, now);
        airFilter.Q.setValueAtTime(1.8, now);

        toneBus.connect(toneFilter);
        toneFilter.connect(master);
        master.connect(ctx.destination);

        const oscillators = [
            { type: 'triangle', gain: 0.34, detune: 0 },
            { type: 'sine', gain: 0.16, detune: 4 },
            { type: 'sine', gain: 0.1, detune: -6 },
        ];

        oscillators.forEach(({ type, gain, detune }) => {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = type;
            osc.detune.setValueAtTime(detune, now);
            scheduleContour(osc.frequency, contour, now, duration, baseFreq);
            oscGain.gain.setValueAtTime(gain, now);
            osc.connect(oscGain);
            oscGain.connect(toneBus);
            osc.start(now);
            osc.stop(now + duration + 0.04);
        });

        const noise = ctx.createBufferSource();
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * (duration + 0.05)));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.linearRampToValueAtTime(0.022, now + 0.03);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        noise.connect(airFilter);
        airFilter.connect(noiseGain);
        noiseGain.connect(master);
        noise.start(now);
        noise.stop(now + duration + 0.03);

        const peakGain = options.peakGain ?? 0.58;
        const sustainGain = options.sustainGain ?? 0.42;
        master.gain.setValueAtTime(0.0001, now);
        master.gain.linearRampToValueAtTime(peakGain, now + 0.045);
        master.gain.linearRampToValueAtTime(sustainGain, now + Math.max(0.08, duration * 0.7));
        master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    } catch (err) {
        console.warn('Tutor contour playback failed:', err);
    }
};

const playTick = (ctx, time, volume = 1) => {
    const oscBody = ctx.createOscillator();
    const gainBody = ctx.createGain();
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(600, time);
    oscBody.frequency.exponentialRampToValueAtTime(300, time + 0.06);
    gainBody.gain.setValueAtTime(0.5 * volume, time);
    gainBody.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    oscBody.connect(gainBody);
    gainBody.connect(ctx.destination);
    const oscClick = ctx.createOscillator();
    const gainClick = ctx.createGain();
    oscClick.type = 'sine';
    oscClick.frequency.setValueAtTime(1600, time);
    gainClick.gain.setValueAtTime(0.35 * volume, time);
    gainClick.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
    oscClick.connect(gainClick);
    gainClick.connect(ctx.destination);
    oscBody.start(time); oscBody.stop(time + 0.06);
    oscClick.start(time); oscClick.stop(time + 0.015);
};

const waitRhythmicUnits = async (units, delayMs, signal, tala) => {
    if (signal?.aborted) return;
    // Sub-beat notes (duration < 1): sleep without firing intermediate ticks —
    // the beat-boundary tick is handled by the beatAcc check in playSequenceAsync.
    if (units < 1) {
        await new Promise(r => setTimeout(r, units * delayMs));
        return;
    }
    const count = Math.round(units);
    for (let unit = 0; unit < count; unit++) {
        if (signal?.aborted) return;
        if (tala && unit > 0) playTick(getAudioCtx(), getAudioCtx().currentTime);
        await new Promise(r => setTimeout(r, delayMs));
    }
};

const playSequenceAsync = async (swaras, sa, onIdx, signal, delayMs = 750, gamakam = false, tala = null, octaveMode = 'auto') => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
        try {
            await ctx.resume();
        } catch {
            // If resume is blocked, the caller's user gesture can retry on next interaction.
        }
    }
    const plainSwaras = getPlainSwaras(swaras);
    const octaves = getOctaveSequence(plainSwaras, octaveMode);
    const unitSec = delayMs / 1000;
    let prevFreq = null;
    let prevNoteIdx = -1;
    let beatAcc = 0; // tracks beat position; tick fires only at integer boundaries

    for (let i = 0; i < swaras.length; i++) {
        if (signal?.aborted) return;
        const swara = getTokenSwara(swaras[i]);
        if (swara === '|' || swara === '||') continue;
        const dur = getTokenDuration(swaras[i]);
        // Fire metronome tick only when we're at an integer beat position
        if (tala && Math.abs(beatAcc - Math.round(beatAcc)) < 0.01) {
            playTick(getAudioCtx(), getAudioCtx().currentTime);
        }
        if (swara === ',' || swara === '-') {
            // hold — keep visual highlight on the sustained note, no new audio attack
            onIdx(prevNoteIdx);
            await waitRhythmicUnits(dur, delayMs, signal, tala);
            beatAcc += dur;
            continue;
        }
        // Peek ahead: count hold beats ('-' or ',') to extend tone duration.
        // Important: barlines do NOT break a sustain chain.
        // Example: ['Sa^', '|', ',', 'Ni3'] should hold Sa^ across the barline.
        let holdCount = 0;
        for (let k = i + 1; k < swaras.length; k++) {
            const nxt = getTokenSwara(swaras[k]);
            if (nxt === '|' || nxt === '||') continue;
            if (nxt !== '-' && nxt !== ',') break;
            holdCount += getTokenDuration(swaras[k]);
        }
        const totalDuration = getTokenDuration(swaras[i]) + holdCount;
        const extDur = holdCount > 0
            ? Math.min((totalDuration * unitSec) * 0.90, 8.0)
            // For non-hold notes, scale directly with rhythmic duration (including sub-beats),
            // so multiple notes inside one beat are short and do not overlap.
            : Math.max(0.05, (dur * unitSec) * 0.80);
        onIdx(i);
        const freq = swaraFreq(swara, sa) * Math.pow(2, octaves[i]);
        playSingleTone(freq, extDur, gamakam ? prevFreq : null);
        prevFreq = freq;
        prevNoteIdx = i;
        await waitRhythmicUnits(dur, delayMs, signal, tala);
        beatAcc += dur;
    }
    onIdx(-1);
};

export {
    GurukulIcon,
    SEMITONES,
    swaraFreq,
    centsDiff,
    centsToNearest,
    getTokenSwara,
    getTokenDuration,
    getTokenNotationSuffix,
    isBarToken,
    getPlainSwaras,
    getTotalUnits,
    renderNotationLabel,
    splitSwarasIntoBeatGroups,
    flattenLyricsInput,
    SahityaBeatMap,
    TalaBadge,
    playSingleTone,
    playContourTone,
    waitRhythmicUnits,
    playSequenceAsync,
    getAudioCtx,
    getOctaveSequence,
};

const centsDiff = (freq, target) => 1200 * Math.log2(freq / target);

// Match freq to the nearest octave of targetSemitone — so singer can use their natural range
const centsToNearest = (freq, targetSt, sa) => {
    let base = sa * Math.pow(2, targetSt / 12);
    while (base * 1.5 < freq) base *= 2;
    while (base / 1.5 > freq) base /= 2;
    return centsDiff(freq, base);
};

// CURRICULUM is imported from tutorCurriculum.js

// ─── Info card exercise ───────────────────────────────────────────────────────
