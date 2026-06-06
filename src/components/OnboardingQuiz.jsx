import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ── Universal questions (everyone sees these) ────────────────────────────────

const U_QUESTIONS = [
    {
        id: 'learner',
        q: 'Who is this for?',
        options: [
            {
                label: 'Me',
                sub: "I'm learning or practicing for myself",
                value: 'self',
                icon: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="7" r="4"/>
                        <path d="M4 21v-1a8 8 0 0116 0v1"/>
                    </svg>
                ),
            },
            {
                label: 'Someone else',
                sub: 'My child, student, or family member',
                value: 'other',
                icon: (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="7" r="3"/>
                        <path d="M2 20v-1a6 6 0 0112 0v1"/>
                        <circle cx="17" cy="9" r="2.5"/>
                        <path d="M13 20v-0.5a4.5 4.5 0 019 0V20"/>
                    </svg>
                ),
            },
        ],
    },
    {
        id: 'age',
        qFn: (a) => a.learner === 'other' ? 'How old are they?' : 'How old are you?',
        options: [
            { label: 'Under 8', value: 'very_young' },
            { label: '8–12',    value: 'child' },
            { label: '13–17',   value: 'teen' },
            { label: '18+',     value: 'adult' },
        ],
    },
    {
        id: 'experience',
        qFn: (a) => a.learner === 'other'
            ? 'Which best describes where they are right now?'
            : 'Which best describes where you are right now?',
        options: [
            { label: 'Completely new',             sub: 'Just getting started with Carnatic music',          value: 'new',      guided: 3, workspace: 0 },
            { label: 'Know some basics',            sub: 'Familiar with a few terms or exercises',            value: 'basics',   guided: 2, workspace: 0 },
            { label: 'Already practice',            sub: 'I sing or study somewhat regularly',                value: 'practice', guided: 0, workspace: 2 },
            { label: 'Serious student or performer',sub: 'Practicing seriously and looking for deeper feedback on specific gaps', value: 'serious',  guided: 0, workspace: 3 },
        ],
    },
    {
        id: 'goal',
        qFn: (a) => a.learner === 'other'
            ? 'What feels difficult for them right now?'
            : 'What feels difficult right now?',
        options: [
            { label: 'My pitch or shruti feels unstable', sub: 'I want to improve my tuning and ear accuracy',           value: 'starting',   guided: 3, workspace: 0 },
            { label: 'I want to build daily practice',    sub: 'A consistent, focused practice flow with structure',     value: 'routine',    guided: 2, workspace: 1 },
            { label: 'I keep confusing ragas',            sub: 'Two ragas sound similar and I cannot tell them apart',   value: 'explore',    guided: 0, workspace: 2 },
            { label: 'I want feedback on what to do next',sub: 'I am practicing but not sure if I am improving',         value: 'transcribe', guided: 0, workspace: 3 },
        ],
    },
    {
        id: 'preference',
        qFn: (a) => a.learner === 'other'
            ? 'What kind of experience sounds better for them?'
            : 'What kind of experience sounds better right now?',
        options: [
            { label: 'Guide me step by step',      sub: 'One clear next step, no decisions needed',       value: 'guided',    guided: 4, workspace: 0 },
            { label: 'Let me direct my own practice', sub: 'I practice regularly and want to choose my own session focus', value: 'workspace', guided: 0, workspace: 4 },
        ],
    },
];

// ── Guided Path placement questions ──────────────────────────────────────────

const GUIDED_QUESTIONS = [
    {
        id: 'studied',
        qFn: (a) => a.learner === 'other' ? 'Have they studied Carnatic music before?' : 'Have you studied Carnatic music before?',
        options: [
            { label: 'Never',        sub: 'Starting completely fresh',          score: 0 },
            { label: 'A little',     sub: 'Some exposure, no formal training',  score: 1 },
            { label: 'Yes, formally',sub: 'Had a guru or classes',              score: 2 },
        ],
    },
    {
        id: 'swaras',
        qFn: (a) => a.learner === 'other' ? 'Can they sing the 7 swaras?' : 'Can you sing the 7 swaras?',
        sub: 'Sa · Ri · Ga · Ma · Pa · Da · Ni',
        options: [
            { label: 'Not yet',                   score: 0 },
            { label: 'A little, not confidently', score: 1 },
            { label: 'Yes, comfortably',           score: 2 },
        ],
    },
    {
        id: 'shruti',
        qFn: (a) => a.learner === 'other' ? 'Can they identify their shruti?' : 'Can you identify your shruti?',
        sub: 'Your personal home note — Sa',
        options: [
            { label: 'Not yet',          score: 0 },
            { label: 'I know what it is',score: 1 },
            { label: 'Yes, I know my Sa',score: 2 },
        ],
    },
    {
        id: 'tala',
        qFn: (a) => a.learner === 'other' ? 'Do they know how to keep Adi Tala?' : 'Do you know how to keep Adi Tala?',
        sub: 'The 8-beat rhythmic cycle used while singing',
        options: [
            { label: 'Not yet',           score: 0 },
            { label: "I've heard of it",  score: 1 },
            { label: 'Yes, I can keep it',score: 2 },
        ],
    },
];

// ── Workspace recommendation question ────────────────────────────────────────

const WORKSPACE_QUESTIONS = [
    {
        id: 'workspace_intent',
        qFn: (a) => a.learner === 'other' ? 'What is their main practice challenge right now?' : 'What is your main practice challenge right now?',
        options: [
            { label: 'I keep confusing similar ragas',    sub: 'Two ragas feel similar and I cannot tell them apart',                            value: 'identify' },
            { label: 'I want to transcribe what I sing',  sub: 'Capture sangatis and musical ideas from my practice sessions',                   value: 'transcribe' },
            { label: 'I need daily structure',            sub: 'Drone, beat, and basic exercises before I start singing',                        value: 'daily_practice' },
            { label: 'I want to understand ragas I study',sub: 'Know the scale and characteristic phrases of the ragas in my current repertoire', value: 'study' },
        ],
    },
];

// ── Tool detection (mirrors CoachPanel) ──────────────────────────────────────

const QUIZ_TOOL_PATTERNS = [
    { pattern: /\b(sadhana|daily practice|daily routine)\b/i,           view: 'sadhana' },
    { pattern: /\b(gurukul|varisai|alankaram|kriti|gitam|lesson)\b/i,   view: 'tutor' },
    { pattern: /\b(raga kosha|raga library|kosha)\b/i,                   view: 'library' },
    { pattern: /\b(viveka)\b/i,                                           view: 'viveka' },
    { pattern: /\b(dhwani)\b/i,                                           view: 'listen' },
    { pattern: /\b(transcribe|sangati)\b/i,                               view: 'transcribe' },
    { pattern: /\b(shruthi|drone|shruti)\b/i,                             view: 'shruthi' },
    { pattern: /\b(talam|tala)\b/i,                                       view: 'talam' },
    { pattern: /\b(keyboard)\b/i,                                         view: 'keyboard' },
    { pattern: /\b(sing.?back|ear training)\b/i,                          view: 'singback' },
];

const TOOL_LABELS = {
    sadhana:    'Open Daily Sadhana',
    transcribe: 'Open Transcribe',
    listen:     'Open Dhwani',
    tutor:      'Open Gurukul',
    library:    'Open Raga Kosha',
    viveka:     'Open Viveka',
    shruthi:    'Open Shruthi',
    talam:      'Open Talam',
    keyboard:   'Open Keyboard',
    singback:   'Open Sing-Back',
};

function cleanReply(text) {
    return String(text || '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/^[ \t]*[-*#>]+\s?/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function detectTool(text) {
    for (const { pattern, view } of QUIZ_TOOL_PATTERNS) {
        if (pattern.test(text)) return view;
    }
    return null;
}

// ── Branch computation ────────────────────────────────────────────────────────

function computeBranch(answers) {
    if (answers.age === 'very_young') return 'guided_path';

    // Serious performers and active practitioners always get the workspace,
    // regardless of whether they asked to be "guided" — "guided" for them means
    // structured coaching inside the workspace, not the beginner onboarding path.
    if (answers.experience === 'serious' || answers.experience === 'practice') {
        return 'practice_workspace';
    }

    const SCORES = {
        experience: { new: [3, 0], basics: [2, 0], practice: [0, 2], serious: [0, 3] },
        goal:       { starting: [3, 0], routine: [2, 1], explore: [0, 2], transcribe: [0, 3] },
        preference: { guided: [2, 0], workspace: [0, 4] }, // reduced guided weight so goal/experience dominate
    };

    let g = 0, w = 0;
    for (const [key, map] of Object.entries(SCORES)) {
        const val = answers[key];
        if (val && map[val]) { g += map[val][0]; w += map[val][1]; }
    }

    if (g >= w + 2) return 'guided_path';
    if (w >= g + 2) return 'practice_workspace';
    if (answers.preference === 'workspace') return 'practice_workspace';
    return 'guided_path';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingQuiz({ active, onDismiss, onNavigate, onModeSelected, userId, getToken }) {
    const [uIdx, setUIdx]       = useState(0);
    const [bIdx, setBIdx]       = useState(0);
    const [stage, setStage]     = useState('universal'); // 'universal' | 'branch' | 'result'
    const [branch, setBranch]   = useState(null);
    const [answers, setAnswers] = useState({});
    const [selected, setSelected]   = useState(null);
    const [advancing, setAdvancing] = useState(false);
    const [exiting, setExiting]     = useState(false);
    const [coachLoading, setCoachLoading] = useState(false);
    const [coachReply, setCoachReply]     = useState(null);
    const [coachTool, setCoachTool]       = useState(null);

    useEffect(() => {
        if (active) {
            setUIdx(0); setBIdx(0);
            setStage('universal');
            setBranch(null);
            setAnswers({});
            setSelected(null);
            setAdvancing(false);
            setCoachLoading(false);
            setCoachReply(null);
            setCoachTool(null);
        }
    }, [active]);

    if (!active) return null;
    if (typeof document === 'undefined' || !document.body) return null;

    const branchQuestions = branch === 'practice_workspace' ? WORKSPACE_QUESTIONS : GUIDED_QUESTIONS;
    const currentQ = stage === 'universal' ? U_QUESTIONS[uIdx] : branchQuestions[bIdx];
    const questionText = currentQ?.qFn ? currentQ.qFn(answers) : currentQ?.q;

    // Progress
    const branchLen = branch
        ? (branch === 'practice_workspace' ? WORKSPACE_QUESTIONS.length : GUIDED_QUESTIONS.length)
        : GUIDED_QUESTIONS.length;
    const totalQ = U_QUESTIONS.length + branchLen;
    const currentQNum = stage === 'universal' ? uIdx + 1 : U_QUESTIONS.length + bIdx + 1;
    const progress = stage === 'result' ? 1 : (currentQNum - 1) / totalQ;

    const canGoBack = !(stage === 'universal' && uIdx === 0) && !coachLoading;

    const fetchCoachRecommendation = async (finalAnswers, finalBranch) => {
        const mode = finalBranch === 'practice_workspace' ? 'musician' : 'beginner';
        try {
            const token = getToken ? await getToken().catch(() => null) : null;
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
            await fetch('/api/profile', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    userId,
                    experience: finalAnswers.experience,
                    goal: finalAnswers.goal,
                    learner: finalAnswers.learner,
                    age: finalAnswers.age,
                    preference: finalAnswers.preference,
                    branch: finalBranch,
                    mode,
                    workspace_intent: finalAnswers.workspace_intent ?? null,
                }),
            });
        } catch {}
        try {
            const token = getToken ? await getToken().catch(() => null) : null;
            const res = await fetch('/api/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    message: [
                        `I just completed my setup.`,
                        finalAnswers.experience && `My experience level: ${finalAnswers.experience}.`,
                        finalAnswers.goal && `My goal: ${finalAnswers.goal}.`,
                        finalAnswers.age && `Age group: ${finalAnswers.age}.`,
                        `I'm on the ${finalBranch === 'practice_workspace' ? 'practice workspace' : 'guided basics'} path.`,
                        `In 2 sentences, tell me the single best tool to open first right now and why.`,
                    ].filter(Boolean).join(' '),
                    userId,
                    history: [],
                    appMode: mode,
                }),
            });
            const data = await res.json();
            const reply = data.reply || null;
            setCoachReply(reply);
            setCoachTool(reply ? detectTool(reply) : null);
        } catch {
            setCoachReply(null);
            setCoachTool(null);
        } finally {
            setCoachLoading(false);
        }
    };

    const dismiss = () => {
        setExiting(true);
        setTimeout(() => {
            setExiting(false);
            setUIdx(0); setBIdx(0);
            setStage('universal');
            setBranch(null);
            setAnswers({});
            setSelected(null);
            setAdvancing(false);
            onDismiss?.();
        }, 200);
    };

    const handleSelect = (opt) => {
        if (advancing) return;
        setSelected(opt);
        setAdvancing(true);
        const newAnswers = {
            ...answers,
            [currentQ.id]: opt.score !== undefined ? opt.score : opt.value,
        };
        setAnswers(newAnswers);

        // Start coach fetch immediately on last branch question so it overlaps the animation
        if (stage === 'branch' && bIdx >= branchQuestions.length - 1) {
            setCoachLoading(true);
            setCoachReply(null);
            setCoachTool(null);
            fetchCoachRecommendation(newAnswers, branch);
        }

        setTimeout(() => {
            if (stage === 'universal') {
                if (uIdx < U_QUESTIONS.length - 1) {
                    setUIdx((i) => i + 1);
                } else {
                    const computedBranch = computeBranch(newAnswers);
                    setBranch(computedBranch);
                    setStage('branch');
                    setBIdx(0);
                }
            } else {
                if (bIdx < branchQuestions.length - 1) {
                    setBIdx((i) => i + 1);
                } else {
                    setStage('result');
                }
            }
            setSelected(null);
            setAdvancing(false);
        }, 320);
    };

    const handleBack = () => {
        if (stage === 'result') {
            setStage('branch');
            setBIdx(branchQuestions.length - 1);
        } else if (stage === 'branch') {
            if (bIdx > 0) {
                setBIdx((i) => i - 1);
            } else {
                setStage('universal');
                setUIdx(U_QUESTIONS.length - 1);
                setBranch(null);
            }
        } else if (stage === 'universal' && uIdx > 0) {
            setUIdx((i) => i - 1);
        }
    };

    const handleBegin = () => {
        const mode = branch === 'practice_workspace' ? 'musician' : 'beginner';
        onModeSelected?.(mode);
        dismiss();
        const view = coachTool || (branch === 'practice_workspace' ? 'listen' : 'tutor');
        onNavigate?.({ view, mode });
    };


    // ── Branch pill colours
    const isGuided = branch === 'guided_path';
    const pillBg    = isGuided ? 'rgba(247,214,134,0.10)' : 'rgba(180,210,247,0.08)';
    const pillBorder= isGuided ? 'rgba(247,214,134,0.20)' : 'rgba(180,210,247,0.18)';
    const pillText  = isGuided ? 'rgba(247,214,134,0.85)' : 'rgba(180,210,247,0.85)';
    const pillLabel = isGuided ? 'Guided Practice' : 'Self-directed Practice';

    return createPortal(
        <div
            className={`fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-4 transition-opacity duration-200 ${exiting ? 'opacity-0' : 'opacity-100'}`}
            style={{ background: 'rgba(10,4,2,0.82)', backdropFilter: 'blur(4px)' }}
        >
            <div
                className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.9)] transition-all duration-200 ${exiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
                style={{ background: '#150801', border: '1px solid rgba(247,214,134,0.18)' }}
            >
                {/* Progress bar */}
                <div className="h-[2px] bg-white/8">
                    <div className="h-full bg-[#f7d686] transition-all duration-500 ease-out" style={{ width: `${progress * 100}%` }} />
                </div>

                <div className="p-5 sm:p-8">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-7">
                        <button
                            onClick={handleBack}
                            className={`text-[11px] font-mono text-white/30 hover:text-white/60 transition-colors flex items-center gap-1 py-2 pr-2 -ml-1 ${!canGoBack ? 'invisible' : ''}`}
                        >
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 2L4 6l4 4"/></svg>
                            Back
                        </button>

                        {stage !== 'result' ? (
                            <span className="text-[9px] font-mono text-[#f7d686]/40 uppercase tracking-widest">
                                {currentQNum} / {branch ? totalQ : U_QUESTIONS.length}
                            </span>
                        ) : (
                            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color: pillText }}>
                                {pillLabel}
                            </span>
                        )}

                        <button
                            onClick={dismiss}
                            className="w-9 h-9 flex items-center justify-center rounded-full text-white/25 hover:text-white/60 hover:bg-white/8 transition-all text-xs -mr-1.5"
                        >
                            ✕
                        </button>
                    </div>

                    {stage !== 'result' ? (
                        /* ── Question screen ── */
                        <>
                            {/* Intro header — first universal question */}
                            {stage === 'universal' && uIdx === 0 && (
                                <div className="mb-5 pb-5 border-b border-white/8">
                                    <h2 className="font-playfair text-[18px] text-[#f7d686] font-bold mb-1.5">What brings you here today?</h2>
                                    <p className="text-white/45 text-[12px] font-playfair leading-relaxed">Answer a few questions and Ālāpana will prescribe your best first practice step.</p>
                                </div>
                            )}

                            {/* Branch intro — first question of branch */}
                            {stage === 'branch' && bIdx === 0 && (
                                <div className="mb-5 pb-5 border-b border-white/8">
                                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mb-3"
                                         style={{ background: pillBg, border: `1px solid ${pillBorder}` }}>
                                        <span className="text-[9px] font-mono uppercase tracking-[0.18em]" style={{ color: pillText }}>{pillLabel}</span>
                                    </div>
                                    <p className="text-white/45 text-[12px] font-playfair leading-relaxed">
                                        {branch === 'guided_path'
                                            ? 'A few more questions to find your best starting lesson.'
                                            : 'One last question to prescribe your first practice step.'}
                                    </p>
                                </div>
                            )}

                            <div className="mb-6">
                                <h2 className="font-playfair text-[19px] sm:text-[22px] text-white font-bold leading-snug mb-2">{questionText}</h2>
                                {currentQ.sub && (
                                    <p className="text-[#f7d686]/50 text-[11px] font-mono tracking-widest">{currentQ.sub}</p>
                                )}
                            </div>

                            <div className="flex flex-col gap-2">
                                {currentQ.options.map((opt) => {
                                    const isChosen = selected === opt;
                                    return (
                                        <button
                                            key={opt.label}
                                            onClick={() => handleSelect(opt)}
                                            disabled={advancing}
                                            className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all duration-200 flex items-center gap-3 ${
                                                isChosen
                                                    ? 'bg-[#f7d686] border-[#f7d686]'
                                                    : 'bg-white/[0.04] border-white/10 hover:border-[#f7d686]/35 hover:bg-white/[0.07]'
                                            }`}
                                        >
                                            {opt.icon && (
                                                <span className={isChosen ? 'text-[#1a0804]' : 'text-[#f7d686]/60'}>
                                                    {opt.icon}
                                                </span>
                                            )}
                                            <span className="flex flex-col min-w-0">
                                                <span className={`font-playfair font-bold text-[13px] leading-tight ${isChosen ? 'text-[#1a0804]' : 'text-white'}`}>
                                                    {opt.label}
                                                </span>
                                                {opt.sub && (
                                                    <span className={`text-[11px] mt-0.5 ${isChosen ? 'text-[#1a0804]/65' : 'text-white/35'}`}>
                                                        {opt.sub}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        /* ── AI-driven result ── */
                        <>
                            <div className="text-center mb-5">
                                <span className="text-[9px] font-mono text-[#f7d686]/50 uppercase tracking-[0.25em] block mb-3">Your best starting point</span>
                                <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                                     style={{ background: pillBg, border: `1px solid ${pillBorder}` }}>
                                    <span className="text-[9px] font-mono uppercase tracking-[0.18em]" style={{ color: pillText }}>{pillLabel}</span>
                                </div>
                            </div>

                            {coachLoading ? (
                                <div className="flex flex-col items-center py-8 gap-4">
                                    <div className="w-7 h-7 rounded-full border-2 border-[#f7d686]/20 border-t-[#f7d686]/70 animate-spin" />
                                    <p className="text-white/35 text-[11px] font-playfair">Personalizing your path…</p>
                                </div>
                            ) : (
                                <>
                                    {coachReply && (
                                        <p className="text-white/65 text-[13px] font-playfair leading-relaxed text-center mb-5">
                                            {cleanReply(coachReply)}
                                        </p>
                                    )}
                                    <div className="flex flex-col gap-2 mt-2">
                                        <button
                                            onClick={handleBegin}
                                            className="w-full py-3 bg-[#f7d686] hover:bg-white text-[#150801] font-playfair font-bold text-sm tracking-wider uppercase rounded-xl transition-all shadow-[0_0_30px_rgba(247,214,134,0.2)]"
                                        >
                                            {coachTool ? (TOOL_LABELS[coachTool] || 'Begin') : 'Begin'} →
                                        </button>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
