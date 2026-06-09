import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser, useAuth, useClerk, SignInButton, UserButton } from '@clerk/clerk-react';
import { createPortal } from 'react-dom';
import AudioInput from './components/AudioInput';
import RagaDisplay from './components/RagaDisplay';
import RagaLibrary from './components/RagaLibrary';
import MelakartaChart from './components/MelakartaChart';
import GeminiPanel from './components/GeminiPanel';
import SwaraKeyboard from './components/SwaraKeyboard';
import GrahaBhedam from './components/GrahaBhedam';
import SingBackChallenge from './components/SingBackChallenge';
import ShruthiBox from './components/ShruthiBox';
import Talam from './components/Talam';
import Tutor from './components/Tutor';
import Viveka from './components/Viveka';
import { getSwaram, identifyRaga, RAGAS } from './utils/ragaLogic';
import RagaDetail from './components/RagaDetail';
import OnboardingTour from './components/OnboardingTour';
import OnboardingQuiz from './components/OnboardingQuiz';
import { CuratedIcon, FireIcon, DhwaniIcon, SadhanaIcon } from './components/IconLibrary';
import SketchyRule from './components/SketchyRule';
import CoachPanel from './components/CoachPanel';
import LearnerModelPanel from './components/LearnerModelPanel';
import SessionDiagnostic from './components/SessionDiagnostic';
import RagaCompare from './components/RagaCompare';

const VeenaIcon = () => (
    <svg width="16" height="50" viewBox="0 0 22 68" fill="none" className="text-c-gold-dim">
        <ellipse cx="11" cy="57" rx="10" ry="9" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="9.5" y="10" width="3" height="47" rx="1.5" fill="currentColor" opacity="0.35"/>
        <line x1="10.5" y1="10" x2="10.5" y2="48" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
        <line x1="12.5" y1="10" x2="12.5" y2="48" stroke="currentColor" strokeWidth="0.7" opacity="0.5"/>
        <line x1="8.5" y1="40" x2="13.5" y2="40" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="8.5" y1="28" x2="13.5" y2="28" stroke="currentColor" strokeWidth="0.9"/>
        <line x1="8.5" y1="18" x2="13.5" y2="18" stroke="currentColor" strokeWidth="0.9"/>
        <path d="M11 10 Q5 6 7 2 Q9 -1 11 1.5 Q13 4 11 7" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        <ellipse cx="11" cy="7" rx="4" ry="3" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
    </svg>
);

const ArrowRightMini = ({ className = "w-4 h-4", ...props }) => (
    <svg viewBox="0 0 20 20" fill="none" className={className} {...props}>
        <path d="M4 10H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11.5 5.5L16 10L11.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);


const renderTabIcon = (id, className = "w-5 h-5") => {
    return <CuratedIcon icon={id} className={className} />;
};

const FEATURES = [
    { id: 'tutor',     label: 'Gurukul',      desc: 'Prescribed correction space — practice the exercise that fixes it', symbol: '📿',  mobileSymbol: '📿', level: 'beginner', highlight: true },
    { id: 'avabodha',  label: 'Avabodha',     desc: 'Listening feedback — detect what you\'re singing and where the confusion is', symbol: '◉',  mobileSymbol: '◉', level: 'intermediate', highlight: true },
    { id: 'listen',    label: 'Dhwani',       desc: 'First-pass real-time listening — what am I singing right now?', symbol: '♬',  mobileSymbol: '♬', level: 'intermediate', highlight: true },
    { id: 'viveka',    label: 'Viveka',       desc: 'Phrase-level discernment — what raga confusion is happening?', symbol: '◎',  mobileSymbol: '◎', level: 'intermediate', highlight: true },
    { id: 'transcribe',label: 'Transcribe',   desc: 'Capture and analyze what you\'re actually singing against tala',    symbol: '✍︎', mobileSymbol: '✍︎', level: 'intermediate', highlight: true },
    { id: 'library',   label: 'Raga Kosha',   desc: 'Supporting reference — understand the raga you\'re working on',    symbol: '◈',  mobileSymbol: '◈', level: 'all', highlight: true },
    { id: 'sadhana',   label: 'Sadhana',      desc: 'Your daily next-step practice sequence',    symbol: '🧘‍♀️', mobileSymbol: '🧘‍♀️', level: 'start' },
    { id: 'shruthi',   label: 'Shruthi',      desc: 'Continuous drone for practice',          symbol: '〜', mobileSymbol: '🎵', level: 'beginner' },
    { id: 'talam',     label: 'Talam',        desc: 'Keep the rhythmic cycle',                symbol: '॥',  mobileSymbol: '🥁', level: 'beginner' },
    { id: 'keyboard',  label: 'Keyboard',     desc: 'Play swaras on virtual keys',            symbol: '♩',  mobileSymbol: '🎹', level: 'intermediate' },
    { id: 'singback',  label: 'Sing-Back',    desc: 'Challenge your raga memory',             symbol: '◎',  mobileSymbol: '🎯', level: 'intermediate' },
    { id: 'melakarta', label: 'Melakarta',    desc: 'The complete 72-raga parent chart',      symbol: '⊹',  mobileSymbol: '🗂️', level: 'advanced' },
    { id: 'bhedam',    label: 'Graha Bhedam', desc: 'Discover modal shifts between ragas',    symbol: '↻',  mobileSymbol: '🔄', level: 'advanced' },
];

const APP_MODES = {
    beginner: {
        id: 'beginner',
        label: 'Guided Practice',
        shortLabel: 'Guided',
        subtitle: 'A guided path with feedback, memory, and a daily next-step sequence.',
        primaryCta: 'Start My Practice Check',
    },
    musician: {
        id: 'musician',
        label: 'Full Practice',
        shortLabel: 'Practice',
        subtitle: 'Listening feedback, persistent memory, and coaching for your specific patterns.',
        primaryCta: 'Continue My Practice Path',
    },
};

const MODE_FEATURE_ORDER = {
    beginner: ['tutor', 'sadhana', 'shruthi', 'talam', 'keyboard', 'singback'],
    musician: ['avabodha', 'transcribe', 'library', 'tutor', 'keyboard', 'shruthi', 'talam', 'melakarta', 'bhedam'],
};

const MODE_ALLOWED_VIEWS = {
    beginner: new Set(['home', 'tutor', 'sadhana', 'shruthi', 'talam', 'keyboard', 'singback', 'learner-model']),
    musician: new Set(['home', 'avabodha', 'tutor', 'listen', 'viveka', 'transcribe', 'library', 'keyboard', 'shruthi', 'talam', 'melakarta', 'bhedam', 'learner-model', 'compare']),
};

const PENDING_ROUTE_KEY = 'alapana_pending_route';

function loadAppMode() {
    try {
        return localStorage.getItem('alapana_app_mode') || 'musician';
    } catch {
        return 'musician';
    }
}

const SADHANA_TABS = ['shruthi', 'tutor', 'keyboard', 'singback'];

const PRACTICE_DEMO_SWARA_LABELS = ['S', 'R1', 'G3', 'M1', 'P', 'D1', 'N3', 'S'];
const EXPLORE_DEMO_RAGAS = [
    {
        name: 'Mayamalavagowla',
        meta: '15th Melakarta',
        number: 15,
        scale: 'S R1 G3 M1 P D1 N3 S',
        grahaBase: 'Mayamalavagowla',
        grahaResults: ['Mohanam', 'Harikambhoji', 'Charukesi', 'Kalyani', 'Vakulabharanam', 'Todi'],
    },
    {
        name: 'Harikambhoji',
        meta: '28th Melakarta',
        number: 28,
        scale: 'S R2 G3 M1 P D2 N2 S',
        grahaBase: 'Harikambhoji',
        grahaResults: ['Kambhoji', 'Kedaragaula', 'Mohanam', 'Kalyani', 'Bilahari', 'Sankarabharanam'],
    },
    {
        name: 'Kalyani',
        meta: '65th Melakarta',
        number: 65,
        scale: 'S R2 G3 M2 P D2 N3 S',
        grahaBase: 'Kalyani',
        grahaResults: ['Mohanam', 'Sankarabharanam', 'Harikambhoji', 'Hamsadhwani', 'Vasanta', 'Charukesi'],
    },
    {
        name: 'Charukesi',
        meta: '26th Melakarta',
        number: 26,
        scale: 'S R2 G3 M1 P D1 N2 S',
        grahaBase: 'Charukesi',
        grahaResults: ['Abheri', 'Kharaharapriya', 'Natabhairavi', 'Madhyamavati', 'Sriranjani', 'Kapi'],
    },
];
const GRAHA_BHEDAM_SWARAS = ['Ri', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni'];
const LIBRARY_PREVIEW_ENTRIES = [
    {
        name: 'Mayamalavagowla',
        meta: '15th Melakarta',
        family: 'Melakarta',
        accent: 'Parent scale',
        swaras: ['S', 'R₁', 'G₃', 'M₁', 'P', 'D₁', 'N₃'],
    },
    {
        name: 'Abheri',
        meta: 'Janya of Kharaharapriya',
        family: 'Janya',
        accent: 'Derived raga',
        swaras: ['S', 'G₂', 'M₁', 'P', 'N₂'],
    },
    {
        name: 'Kalyani',
        meta: '65th Melakarta',
        family: 'Melakarta',
        accent: 'Prati madhyama',
        swaras: ['S', 'R₂', 'G₃', 'M₂', 'P', 'D₂', 'N₃'],
    },
    {
        name: 'Hamsadhwani',
        meta: 'Janya of Sankarabharanam',
        family: 'Janya',
        accent: 'Audava raga',
        swaras: ['S', 'R₂', 'G₃', 'P', 'N₃'],
    },
];
const GRAHA_PREVIEW_ENTRIES = [
    {
        base: 'Sankarabharanam',
        results: ['Harikambhoji', 'Kalyani', 'Natabhairavi', 'Kharaharapriya', 'Hanumatodi', 'Kambhoji'],
    },
    {
        base: 'Mayamalavagowla',
        results: ['Mohanam', 'Harikambhoji', 'Charukesi', 'Kalyani', 'Vakulabharanam', 'Todi'],
    },
    {
        base: 'Kharaharapriya',
        results: ['Abheri', 'Sriranjani', 'Madhyamavati', 'Sudha Dhanyasi', 'Kapi', 'Bilahari'],
    },
];
const TRANSCRIBE_PREVIEW_PHRASES = [
    ['sa', 'ri', 'ga', 'ma', '|', 'pa,', 'ma', 'ga', 'ri', '|', 'sa'],
    ['sa', 'ma', 'ga', 'ri', '|', 'pa', 'dha', 'ni', '|', 'sa'],
];

const GURUKUL_PREVIEW_CATEGORIES = [
    {
        name: 'Varisais',
        meta: '12 items',
        detailTitle: 'Mayamalavagowla · Varisais',
        detailMeta: 'Raga: Mayamalavagowla | Tala: Adi',
        snippets: [
            ['sa', 'ri', 'ga', 'ma', '|', 'ga', 'ri', 'sa'],
            ['sa', 'sa', 'ri', 'ga', '|', 'ma,', 'ga', 'ri'],
        ],
    },
    {
        name: 'Kritis',
        meta: '36 items',
        detailTitle: 'Vasanta · Kritis',
        detailMeta: 'Raga: Vasanta | Tala: Adi',
        snippets: [
            ['ni', 'sa', 'ri', 'ga', '|', 'ma,', 'ga', 'ri', 'sa', '|'],
            ['ni', 'sa', 'ri', 'ga', '|', 'ma,', 'ga', 'ri', 'sa', '|'],
        ],
    },
    {
        name: 'Alapanas',
        meta: '8 items',
        detailTitle: 'Kalyani · Alapanas',
        detailMeta: 'Raga: Kalyani | Free Flow',
        snippets: [
            ['sa', 'ri', 'ga', 'ma', '|', 'pa', 'ma', 'ga'],
            ['ni,', 'sa', 'ri', 'ga', '|', 'ma', 'pa', 'dha'],
        ],
    },
    {
        name: 'Notes',
        meta: '23 items',
        detailTitle: 'Concert Notes · Notebook',
        detailMeta: 'Topic: Sangati Ideas | Tala: Mixed',
        snippets: [
            ['sa', 'ri', 'ga', '|', 'note', 'phrase', '1'],
            ['ma', 'pa', 'dha', '|', 'resolve', 'to', 'sa'],
        ],
    },
    {
        name: 'Recordings',
        meta: '19 items',
        detailTitle: 'Practice Takes · Recordings',
        detailMeta: 'Session: Evening Riyaz | 19 clips',
        snippets: [
            ['take', '1', '|', 'sa', 'ri', 'ga', 'ma'],
            ['take', '2', '|', 'pa', 'ma', 'ga', 'ri'],
        ],
    },
];

const GURUKUL_PRACTICE_LOG = [
    { name: 'Mayamalavagowla', type: 'Varnam', tala: 'Adi', progress: 82, days: 14 },
    { name: 'Hamsadhwani', type: 'Gitam', tala: 'Rupaka', progress: 57, days: 7 },
    { name: 'Kalyani', type: 'Kriti', tala: 'Adi', progress: 38, days: 3 },
];

function parseHashRoute(hashValue = window.location.hash) {
    const normalized = hashValue.replace(/^#\/?/, '').trim();
    if (!normalized) return { view: 'home', segments: [], mode: null, workspace: false };
    const segments = normalized.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
    const first = segments[0] || 'home';
    const validModes = new Set(['beginner', 'musician']);

    if (first === 'home') {
        return { view: 'home', segments: ['home'], mode: null, workspace: false, about: false };
    }

    if (first === 'about') {
        return { view: 'home', segments: ['home'], mode: null, workspace: false, about: true };
    }

    if (first === 'workspace') {
        const mode = validModes.has(segments[1]) ? segments[1] : null;
        return { view: 'home', segments: ['home'], mode, workspace: true };
    }

    if (validModes.has(first)) {
        const view = segments[1] || 'home';
        const rest = segments.slice(2);
        // compare view embeds raga names: #/musician/compare/RagaA/RagaB
        const ragaA = view === 'compare' && rest[0] ? rest[0] : null;
        const ragaB = view === 'compare' && rest[1] ? rest[1] : null;
        return { view, segments: [view, ...rest], mode: first, workspace: false, ragaA, ragaB };
    }

    return { view: first, segments, mode: null, workspace: false };
}

function parseTutorHashTarget(segments = []) {
    if (!segments.length || segments[0] !== 'tutor') return null;
    const target = {};
    for (let i = 1; i < segments.length; i += 2) {
        const key = segments[i];
        const value = segments[i + 1];
        if (!value) break;
        if (key === 'tab') target.tab = value;
        if (key === 'raga') target.raga = value;
        if (key === 'course') target.courseId = value;
        if (key === 'unit') target.unitId = value;
        if (key === 'lesson') target.lessonId = value;
    }
    return Object.keys(target).length ? target : null;
}

function buildHashForView(view, tutorTarget = null, mode = null, options = {}) {
    const { workspace = false } = options;
    if (workspace && mode) return `#/workspace/${encodeURIComponent(mode)}`;
    if (!view || view === 'home') return '#/home';
    // learner-model is mode-agnostic — omit mode from URL so reloading it never
    // silently switches the app from beginner to musician or vice versa.
    if (view === 'learner-model') return '#/learner-model';
    if (view === 'compare' && options.ragaA && options.ragaB) {
        const base = mode ? `#/${encodeURIComponent(mode)}/compare` : '#/compare';
        return `${base}/${encodeURIComponent(options.ragaA)}/${encodeURIComponent(options.ragaB)}`;
    }
    if (view !== 'tutor') {
        return mode
            ? `#/${encodeURIComponent(mode)}/${encodeURIComponent(view)}`
            : `#/${view}`;
    }

    const segments = mode ? [mode, 'tutor'] : ['tutor'];
    if (tutorTarget?.tab && tutorTarget.tab !== 'curriculum') {
        segments.push('tab', tutorTarget.tab);
    }
    if (tutorTarget?.raga) {
        segments.push('raga', tutorTarget.raga);
    }
    if (tutorTarget?.courseId) {
        segments.push('course', tutorTarget.courseId);
    }
    if (tutorTarget?.unitId) {
        segments.push('unit', tutorTarget.unitId);
    }
    if (tutorTarget?.lessonId) {
        segments.push('lesson', tutorTarget.lessonId);
    }
    return `#/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getYesterdayDateString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function loadSadhanaState() {
    const today = getLocalDateString();
    const yesterday = getYesterdayDateString();
    try {
        const s = JSON.parse(localStorage.getItem('alapana_sadhana_v1') || 'null');
        if (!s) {
            const newState = { date: today, completed: [], streak: 0 };
            localStorage.setItem('alapana_sadhana_v1', JSON.stringify(newState));
            return newState;
        }
        if (s.date === today) return s;
        const streak = (s.date === yesterday && s.completed.length >= SADHANA_TABS.length)
            ? (s.streak || 0) + 1 : 0;
        const newState = { date: today, completed: [], streak };
        localStorage.setItem('alapana_sadhana_v1', JSON.stringify(newState));
        return newState;
    } catch {
        const newState = { date: today, completed: [], streak: 0 };
        localStorage.setItem('alapana_sadhana_v1', JSON.stringify(newState));
        return newState;
    }
}

function getGuestUserId() {
    try {
        let id = localStorage.getItem('alapana_user_id');
        if (!id) { id = 'user_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('alapana_user_id', id); }
        return id;
    } catch { return 'default'; }
}

function App() {
    const { user, isSignedIn } = useUser();
    const { getToken } = useAuth();
    const { openSignIn } = useClerk();
    const guestUserId = useRef(getGuestUserId());
    const userId = (isSignedIn && user?.id) ? user.id : guestUserId.current;

    // Restore last route on fresh load (no hash in URL)
    const startingHash = window.location.hash ||
        (() => { try { return localStorage.getItem('alapana_last_route') || ''; } catch { return ''; } })();
    const initialRoute = parseHashRoute(startingHash);
    const [view, setView] = useState(() => initialRoute.view);
    const [appMode, setAppMode] = useState(loadAppMode);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [showFeatures, setShowFeatures] = useState(() => initialRoute.workspace ? true : initialRoute.view !== 'home');
    const [showWorkspaceSections, setShowWorkspaceSections] = useState(() => {
        if (initialRoute.workspace) return true;
        return false;
    });
    const [saFrequency, setSaFrequency] = useState(null);
    const [detectedNotes, setDetectedNotes] = useState([]);
    const [possibleRagas, setPossibleRagas] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [activeMode, setActiveMode] = useState('standard');
    const [tourActive, setTourActive] = useState(false);
    const [quizActive, setQuizActive] = useState(false);
    const [diagnosticActive, setDiagnosticActive] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(() => initialRoute.about === true);
    const [tutorLaunchTarget, setTutorLaunchTarget] = useState(() => {
        const route = initialRoute;
        return route.view === 'tutor' ? parseTutorHashTarget(route.segments) : null;
    });
    const [sadhana, setSadhana] = useState(loadSadhanaState);
    const [sadhanaToast, setSadhanaToast] = useState(null); // { title, stepName }
    const [selectedRaga, setSelectedRaga] = useState(null); // { raga, hasClearMatch, type: 'library' | 'identify' | 'melakarta' }
    const [compareRagas, setCompareRagas] = useState(null); // { a, b }
    const [agentRec, setAgentRec]         = useState(null); // agent JSON recommendation
    const [agentRecLoading, setAgentRecLoading] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [practiceDemoBeat, setPracticeDemoBeat] = useState(0);
    const [practiceDemoSlider, setPracticeDemoSlider] = useState(4);
    const [practiceDemoKeyIndex, setPracticeDemoKeyIndex] = useState(0);
    const [practiceDemoPitchState, setPracticeDemoPitchState] = useState('match');
    const [hoveredWorkspacePreview, setHoveredWorkspacePreview] = useState(null);
    const [avabodhaPreviewStarted, setAvabodhaPreviewStarted] = useState(false);
    const [libraryPreviewIndex, setLibraryPreviewIndex] = useState(0);
    const [explorePreviewIndex, setExplorePreviewIndex] = useState(0);
    const [explorePreviewDisplayNumber, setExplorePreviewDisplayNumber] = useState(EXPLORE_DEMO_RAGAS[0].number);
    const [explorePreviewWheelRotation, setExplorePreviewWheelRotation] = useState(0);
    const [grahaPreviewIndex, setGrahaPreviewIndex] = useState(0);
    const [explorePreviewShiftIndex, setExplorePreviewShiftIndex] = useState(0);
    const [transcribePreviewMode, setTranscribePreviewMode] = useState('idle');
    const [transcribePreviewTokenIndex, setTranscribePreviewTokenIndex] = useState(0);
    const [transcribePreviewPhraseIndex, setTranscribePreviewPhraseIndex] = useState(0);
    const [transcribePreviewSeconds, setTranscribePreviewSeconds] = useState(37);
    const [gurukulPreviewCategoryIndex, setGurukulPreviewCategoryIndex] = useState(1);
    const [gurukulPreviewMenuOpen, setGurukulPreviewMenuOpen] = useState(false);
    const [gurukulPreviewSnippetIndex, setGurukulPreviewSnippetIndex] = useState(0);
    const [workspaceModel, setWorkspaceModel] = useState(null);
    const [workspaceModelLoading, setWorkspaceModelLoading] = useState(false);

    const visibleFeatures = MODE_FEATURE_ORDER[appMode]
        .map((id) => FEATURES.find((feature) => feature.id === id))
        .filter(Boolean);

    const noteHistory = useRef([]);
    const sessionFreq = useRef({});
    const transcribeWaveBarRefs = useRef([]);
    const transcribeWaveFrameRef = useRef(null);
    const workspaceModelFetched = useRef(false);
    const step = !isListening ? 1 : !saFrequency ? 2 : 3;
    const isPreviewOpen = view === 'home' && showFeatures && !showWorkspaceSections;
    const isWorkspaceExpanded = view === 'home' && showFeatures && showWorkspaceSections;
    const shruthiPreviewActive = hoveredWorkspacePreview === 'shruthi';
    const talamPreviewActive = hoveredWorkspacePreview === 'talam';
    const keyboardPreviewActive = hoveredWorkspacePreview === 'keyboard';
    const avabodhaPreviewActive = hoveredWorkspacePreview === 'avabodha';
    const libraryPreviewActive = hoveredWorkspacePreview === 'library';
    const melakartaPreviewActive = hoveredWorkspacePreview === 'melakarta';
    const bhedamPreviewActive = hoveredWorkspacePreview === 'bhedam';
    const transcribePreviewActive = hoveredWorkspacePreview === 'transcribe';
    const gurukulPreviewActive = hoveredWorkspacePreview === 'gurukul';
    const selectedLibraryEntry = LIBRARY_PREVIEW_ENTRIES[libraryPreviewIndex % LIBRARY_PREVIEW_ENTRIES.length];
    const selectedExploreRaga = EXPLORE_DEMO_RAGAS[explorePreviewIndex % EXPLORE_DEMO_RAGAS.length];
    const selectedGrahaEntry = GRAHA_PREVIEW_ENTRIES[grahaPreviewIndex % GRAHA_PREVIEW_ENTRIES.length];
    const selectedGrahaResult = selectedGrahaEntry.results[explorePreviewShiftIndex % selectedGrahaEntry.results.length];
    const selectedGrahaSwara = GRAHA_BHEDAM_SWARAS[explorePreviewShiftIndex % GRAHA_BHEDAM_SWARAS.length];
    const currentTranscribePhrase = TRANSCRIBE_PREVIEW_PHRASES[transcribePreviewPhraseIndex % TRANSCRIBE_PREVIEW_PHRASES.length];
    const selectedGurukulCategory = GURUKUL_PREVIEW_CATEGORIES[gurukulPreviewCategoryIndex % GURUKUL_PREVIEW_CATEGORIES.length];
    const avabodhaPreviewMode = !avabodhaPreviewStarted || practiceDemoPitchState === 'match' ? 'dhwani' : 'viveka';

    useEffect(() => {
        const beatTimer = setInterval(() => {
            setPracticeDemoBeat((prev) => (prev + 1) % 8);
        }, 720);

        const sliderTimer = setInterval(() => {
            setPracticeDemoSlider((prev) => {
                const sequence = [2, 3, 4, 5, 4, 3];
                const currentIndex = sequence.indexOf(prev);
                return sequence[(currentIndex + 1) % sequence.length];
            });
        }, 2200);

        const keyTimer = setInterval(() => {
            setPracticeDemoKeyIndex((prev) => (prev + 1) % PRACTICE_DEMO_SWARA_LABELS.length);
        }, 1250);

        const listeningTimer = setInterval(() => {
            setPracticeDemoPitchState((prev) => (prev === 'match' ? 'off' : 'match'));
        }, 1800);

        return () => {
            clearInterval(beatTimer);
            clearInterval(sliderTimer);
            clearInterval(keyTimer);
            clearInterval(listeningTimer);
        };
    }, []);

    useEffect(() => {
        if (hoveredWorkspacePreview !== 'library') return undefined;
        const libraryTimer = setInterval(() => {
            setLibraryPreviewIndex((prev) => (prev + 1) % LIBRARY_PREVIEW_ENTRIES.length);
        }, 2400);
        return () => clearInterval(libraryTimer);
    }, [hoveredWorkspacePreview]);

    useEffect(() => {
        if (hoveredWorkspacePreview !== 'melakarta') return undefined;
        const ragaTimer = setInterval(() => {
            setExplorePreviewIndex((prev) => (prev + 1) % EXPLORE_DEMO_RAGAS.length);
        }, 2600);
        return () => clearInterval(ragaTimer);
    }, [hoveredWorkspacePreview]);

    useEffect(() => {
        if (hoveredWorkspacePreview !== 'bhedam') return undefined;
        const baseTimer = setInterval(() => {
            setGrahaPreviewIndex((prev) => (prev + 1) % GRAHA_PREVIEW_ENTRIES.length);
        }, 3000);
        const shiftTimer = setInterval(() => {
            setExplorePreviewShiftIndex((prev) => (prev + 1) % GRAHA_BHEDAM_SWARAS.length);
        }, 1700);
        return () => {
            clearInterval(baseTimer);
            clearInterval(shiftTimer);
        };
    }, [hoveredWorkspacePreview]);

    useEffect(() => {
        const targetNumber = selectedExploreRaga.number;
        const counterTimer = setInterval(() => {
            setExplorePreviewDisplayNumber((prev) => {
                if (prev === targetNumber) return prev;
                const delta = targetNumber - prev;
                const step = Math.abs(delta) > 18 ? Math.ceil(Math.abs(delta) / 8) : 1;
                const next = prev + (delta > 0 ? step : -step);
                if (delta > 0) return Math.min(next, targetNumber);
                return Math.max(next, targetNumber);
            });
        }, 42);
        return () => clearInterval(counterTimer);
    }, [selectedExploreRaga.number]);

    useEffect(() => {
        const targetAngle = ((selectedExploreRaga.number - 1) / 72) * 360;
        setExplorePreviewWheelRotation((prev) => {
            const normalizedPrev = ((prev % 360) + 360) % 360;
            const clockwiseDelta = ((targetAngle - normalizedPrev) + 360) % 360;
            return prev + (clockwiseDelta < 36 ? clockwiseDelta + 90 : clockwiseDelta);
        });
    }, [selectedExploreRaga.number]);

    useEffect(() => {
        if (!transcribePreviewActive) {
            setTranscribePreviewMode('idle');
            setTranscribePreviewTokenIndex(0);
            setTranscribePreviewPhraseIndex(0);
            setTranscribePreviewSeconds(37);
            return undefined;
        }

        setTranscribePreviewMode('recording');
        const processingTimeout = setTimeout(() => setTranscribePreviewMode('processing'), 4400);
        const restartTimeout = setTimeout(() => {
            setTranscribePreviewPhraseIndex((prev) => (prev + 1) % TRANSCRIBE_PREVIEW_PHRASES.length);
            setTranscribePreviewTokenIndex(0);
            setTranscribePreviewSeconds(37);
            setTranscribePreviewMode('recording');
        }, 5600);

        return () => {
            clearTimeout(processingTimeout);
            clearTimeout(restartTimeout);
        };
    }, [transcribePreviewActive, transcribePreviewPhraseIndex]);

    useEffect(() => {
        if (!transcribePreviewActive || transcribePreviewMode !== 'recording') return undefined;
        const syllableTimer = setInterval(() => {
            setTranscribePreviewTokenIndex((prev) => Math.min(prev + 1, currentTranscribePhrase.length - 1));
        }, 340);
        const timeTimer = setInterval(() => {
            setTranscribePreviewSeconds((prev) => prev + 1);
        }, 1000);
        return () => {
            clearInterval(syllableTimer);
            clearInterval(timeTimer);
        };
    }, [transcribePreviewActive, transcribePreviewMode, currentTranscribePhrase.length]);

    useEffect(() => {
        const bars = transcribeWaveBarRefs.current.filter(Boolean);
        if (!bars.length) return undefined;

        let start = performance.now();
        const animate = (now) => {
            const elapsed = now - start;
            bars.forEach((bar, index) => {
                const centerWeight = 1 - Math.abs(index - (bars.length - 1) / 2) / ((bars.length - 1) / 2);
                let scale = 0.9 + (Math.sin(elapsed / 680 + index * 0.42) * 0.05);
                let opacity = 0.28 + (centerWeight * 0.2);

                if (transcribePreviewMode === 'recording') {
                    const reactive = (Math.sin(elapsed / 160 + index * 0.55) + Math.sin(elapsed / 240 + index * 0.24)) / 2;
                    scale = 0.72 + ((reactive + 1) / 2) * (0.42 + centerWeight * 0.46);
                    opacity = 0.34 + centerWeight * 0.4;
                } else if (transcribePreviewMode === 'processing') {
                    scale = 0.82 + centerWeight * 0.1;
                    opacity = 0.26 + centerWeight * 0.18;
                }

                bar.style.transform = `scaleY(${scale.toFixed(3)})`;
                bar.style.opacity = opacity.toFixed(3);
            });
            transcribeWaveFrameRef.current = requestAnimationFrame(animate);
        };

        transcribeWaveFrameRef.current = requestAnimationFrame(animate);
        return () => {
            if (transcribeWaveFrameRef.current) cancelAnimationFrame(transcribeWaveFrameRef.current);
        };
    }, [transcribePreviewMode]);

    useEffect(() => {
        if (!gurukulPreviewActive) {
            setGurukulPreviewMenuOpen(false);
            setGurukulPreviewSnippetIndex(0);
            return undefined;
        }
        const menuTimer = setTimeout(() => setGurukulPreviewMenuOpen(true), 220);
        const categoryTimer = setInterval(() => {
            setGurukulPreviewCategoryIndex((prev) => (prev + 1) % GURUKUL_PREVIEW_CATEGORIES.length);
        }, 3000);
        const snippetTimer = setInterval(() => {
            setGurukulPreviewSnippetIndex((prev) => (prev + 1) % 2);
        }, 1800);
        return () => {
            clearTimeout(menuTimer);
            clearInterval(categoryTimer);
            clearInterval(snippetTimer);
        };
    }, [gurukulPreviewActive]);

    // Body scroll lock
    useEffect(() => {
        if (selectedRaga) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [selectedRaga]);

    const handlePitchDetected = (frequency) => {
        if (!saFrequency) return;
        const swaram = getSwaram(frequency, saFrequency);
        if (!swaram) return;

        const now = Date.now();
        noteHistory.current.push({ note: swaram, time: now });
        noteHistory.current = noteHistory.current.filter(e => now - e.time < 3000);

        const window = noteHistory.current.filter(e => now - e.time < 900);
        if (window.length < 5) return;
        const matches = window.filter(e => e.note === swaram).length;
        if (matches / window.length >= 0.85) {
            sessionFreq.current[swaram] = (sessionFreq.current[swaram] || 0) + 1;
            setDetectedNotes(prev => {
                if (prev.includes(swaram)) return prev;
                return [...prev, swaram];
            });
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            if (detectedNotes.length >= 3) {
                setPossibleRagas(identifyRaga(detectedNotes, sessionFreq.current));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [detectedNotes]);

    useEffect(() => {
        if (initialRoute.mode && initialRoute.mode !== appMode) {
            setAppMode(initialRoute.mode);
        }
        // only needs to run once on mount for the parsed initial route
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('alapana_app_mode', appMode);
        } catch {}
    }, [appMode]);

    // Fetch learner model + agent recommendation in parallel when workspace first expands.
    useEffect(() => {
        if (!isWorkspaceExpanded || !isSignedIn || !userId || workspaceModelFetched.current) return;
        workspaceModelFetched.current = true;
        setWorkspaceModelLoading(true);
        setAgentRecLoading(true);
        const load = async () => {
            try {
                const token = getToken ? await getToken() : null;
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                const uid = encodeURIComponent(userId);
                const [modelRes, recRes] = await Promise.allSettled([
                    fetch(`/api/learner-model?userId=${uid}`, { headers }),
                    fetch(`/api/recommend?userId=${uid}`,     { headers }),
                ]);
                if (modelRes.status === 'fulfilled' && modelRes.value.ok)
                    setWorkspaceModel(await modelRes.value.json());
                if (recRes.status === 'fulfilled' && recRes.value.ok)
                    setAgentRec(await recRes.value.json());
            } catch { /* non-fatal */ }
            finally { setWorkspaceModelLoading(false); setAgentRecLoading(false); }
        };
        load();
    }, [isWorkspaceExpanded, isSignedIn, userId, getToken]); // eslint-disable-line react-hooks/exhaustive-deps

    // Derive the two guided workspace blocks from the learner model.
    // Each block only renders when real data supports it — nothing is fabricated.
    const workspaceBlocks = workspaceModel ? (() => {
        const { confusionPairs = [], ragaStats = [] } = workspaceModel;
        const msDay = 86400000;
        const daysAgo = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / msDay) : null;

        // Focus items: stale or ready-to-advance ragas
        const focusItems = [];
        ragaStats.forEach(r => {
            const d = daysAgo(r.lastPracticed);
            if ((r.masteryLevel === 'developing' || r.masteryLevel === 'exploring') && d !== null && d > 3) {
                focusItems.push({ icon: '↩', text: `${r.raga} — ${d}d ago, still ${r.masteryLevel}`, action: 'tutor', ragaName: r.raga, urgency: d > 7 ? 'high' : 'medium' });
            } else if (r.masteryLevel === 'stable' && r.identifiedCount >= 3) {
                focusItems.push({ icon: '↑', text: `${r.raga} — stable, ready for advanced phrases`, action: 'tutor', ragaName: r.raga, urgency: 'low' });
            }
        });

        return {
            confusionPairs: confusionPairs.slice(0, 3),
            focusItems: focusItems.slice(0, 3),
        };
    })() : null;

    const handleReset = () => {
        setDetectedNotes([]);
        setPossibleRagas([]);
        noteHistory.current = [];
        sessionFreq.current = {};
    };

    const handleRemoveNote = (note) => {
        noteHistory.current = noteHistory.current.filter(e => e.note !== note);
        delete sessionFreq.current[note];
        setDetectedNotes(prev => {
            const next = prev.filter(n => n !== note);
            if (next.length >= 3) setPossibleRagas(identifyRaga(next, sessionFreq.current));
            else setPossibleRagas([]);
            return next;
        });
    };

    const switchAppMode = (nextMode, options = {}) => {
        const { destination = 'home', reveal = true } = options;
        setAppMode(nextMode);
        setShowFeatures(reveal);
        setShowWorkspaceSections(false);
        const allowedViews = MODE_ALLOWED_VIEWS[nextMode] || MODE_ALLOWED_VIEWS.musician;
        const nextView = allowedViews.has(destination) ? destination : 'home';
        if (nextView === 'home') {
            goTo('home');
        } else {
            goTo(nextView);
        }
    };

    const markSadhanaStep = (tab) => {
        // Sadhana is a Guided Basics feature — no-op in musician/workspace mode
        if (appMode !== 'beginner') return;

        const detailsMap = {
            shruthi: { title: 'Warm-Up Complete', stepName: 'Step 1' },
            tutor: { title: 'AI Vocal Practice Complete', stepName: 'Step 2' },
            keyboard: { title: 'Scale Exploration Complete', stepName: 'Step 3' },
            singback: { title: 'Ear Training Challenge Complete', stepName: 'Step 4' },
        };

        if (sadhana.completed.includes(tab)) return;

        setSadhana(prev => {
            if (prev.completed.includes(tab)) return prev;
            const next = { ...prev, completed: [...prev.completed, tab] };
            localStorage.setItem('alapana_sadhana_v1', JSON.stringify(next));
            return next;
        });

        if (detailsMap[tab]) {
            setSadhanaToast({
                title: detailsMap[tab].title,
                stepName: detailsMap[tab].stepName
            });
            setTimeout(() => setSadhanaToast(null), 4000);
        }
    };

    const viewRef = useRef(view);
    viewRef.current = view;

    useEffect(() => {
        const allowedViews = MODE_ALLOWED_VIEWS[appMode] || MODE_ALLOWED_VIEWS.musician;
        if (!allowedViews.has(view)) {
            goTo('home');
        }
    }, [appMode, view]);

    const applyParsedRoute = useCallback((route) => {
        const targetMode = route.mode || appMode;
        const targetView = route.view || 'home';
        const allowedViews = MODE_ALLOWED_VIEWS[targetMode] || MODE_ALLOWED_VIEWS.musician;
        if (!allowedViews.has(targetView)) {
            window.location.hash = '#/home';
            return;
        }
        setAboutOpen(!!route.about);
        if (route.mode && route.mode !== appMode) {
            setAppMode(route.mode);
        }
        if (targetView !== viewRef.current) {
            if (targetView !== 'listen') handleReset();
            setView(targetView);
            setShowFeatures(route.workspace ? true : targetView !== 'home');
            setShowWorkspaceSections(route.workspace);
        } else if (targetView === 'home') {
            setShowFeatures(route.workspace ? true : false);
            setShowWorkspaceSections(route.workspace);
        }
        setTutorLaunchTarget(targetView === 'tutor' ? parseTutorHashTarget(route.segments) : null);
        if (targetView === 'compare' && route.ragaA && route.ragaB) {
            setCompareRagas({ a: route.ragaA, b: route.ragaB });
        }
    }, [appMode]);

    // Listen for hashchange events (back/forward navigation only — not goTo-triggered changes)
    useEffect(() => {
        const handleHashChange = () => applyParsedRoute(parseHashRoute());
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [applyParsedRoute]);


    const promptSignIn = useCallback(() => {
        setMobileMenuOpen(false);
        openSignIn?.();
    }, [openSignIn]);

    useEffect(() => {
        if (isSignedIn) return;
        if (window.location.hash && window.location.hash !== '#/home' && window.location.hash !== '#/about') {
            try { localStorage.setItem(PENDING_ROUTE_KEY, window.location.hash); } catch {}
        }
        if (view !== 'home') setView('home');
        if (showFeatures) setShowFeatures(false);
        if (showWorkspaceSections) setShowWorkspaceSections(false);
        if (quizActive) setQuizActive(false);
        if (tourActive) setTourActive(false);
    }, [isSignedIn, view, showFeatures, showWorkspaceSections, quizActive, tourActive]);

    useEffect(() => {
        if (!isSignedIn) return;
        const hashRoute = window.location.hash && window.location.hash !== '#/home' && window.location.hash !== '#/about'
            ? window.location.hash
            : '';
        const pendingRoute = (() => { try { return localStorage.getItem(PENDING_ROUTE_KEY) || ''; } catch { return ''; } })();
        const routeToApply = hashRoute || pendingRoute;
        if (!routeToApply) return;
        applyParsedRoute(parseHashRoute(routeToApply));
        try { localStorage.removeItem(PENDING_ROUTE_KEY); } catch {}
    }, [isSignedIn, applyParsedRoute]);

    const goTo = (id, options = {}) => {
        const { tutorTarget = null, modeOverride = null, workspace = false, ragaA = null, ragaB = null } = options;
        if (!isSignedIn && (id !== 'home' || workspace || tutorTarget || modeOverride)) {
            const pendingHash = buildHashForView(id, tutorTarget, modeOverride || appMode, { workspace, ragaA, ragaB });
            try { localStorage.setItem(PENDING_ROUTE_KEY, pendingHash); } catch {}
            promptSignIn();
            setView('home');
            setShowFeatures(false);
            setShowWorkspaceSections(false);
            return;
        }
        const effectiveMode = modeOverride || appMode;
        const allowedViews = MODE_ALLOWED_VIEWS[effectiveMode] || MODE_ALLOWED_VIEWS.musician;
        if (!allowedViews.has(id) && id !== 'home') {
            id = 'home';
        }
        if (modeOverride && modeOverride !== appMode) {
            setAppMode(modeOverride);
        }
        if (id !== 'listen') handleReset();
        setTutorLaunchTarget(id === 'tutor' ? tutorTarget : null);

        // Navigation events are intentionally NOT written to MongoDB.
        // Only evaluated practice sessions (from RagaPracticePanel, LessonRunner, etc.)
        // belong in the learner memory — opening a tool is not a practice event.

        setView(id);
        if (id === 'home') {
            setShowFeatures(workspace);
            setShowWorkspaceSections(workspace);
        } else {
            setShowFeatures(true);
            setShowWorkspaceSections(false);
        }
        const nextHash = buildHashForView(id, tutorTarget, effectiveMode, { workspace, ragaA, ragaB });
        if (window.location.hash !== nextHash) {
            window.location.hash = nextHash;
        }
        try { localStorage.setItem('alapana_last_route', nextHash); } catch {}
    };

    const goToAdvanced = (id, options = {}) => goTo(id, { ...options, modeOverride: 'musician' });

    const goToCompare = (a, b) => {
        setCompareRagas({ a, b });
        goToAdvanced('compare', { ragaA: a, ragaB: b });
    };

    const routeAgentDest = (dest) => {
        if (!dest) return;
        if (dest.view === 'compare' && dest.ragaA && dest.ragaB) {
            goToCompare(dest.ragaA, dest.ragaB);
        } else if (dest.view === 'tutor' && dest.raga) {
            goToAdvanced('tutor', { tutorTarget: { tab: 'practice', raga: dest.raga } });
        } else {
            goToAdvanced(dest.view || 'tutor');
        }
    };
    const enterWorkspace = (modeOverride = appMode) => goTo('home', { modeOverride, workspace: true });

    const openAbout = () => {
        setAboutOpen(true);
        if (window.location.hash !== '#/about') window.location.hash = '#/about';
    };
    const closeAbout = () => {
        setAboutOpen(false);
        if (window.location.hash === '#/about') window.location.hash = '#/home';
    };

    const handleTutorNavigation = (target = null, options = {}) => {
        const { replace = false } = options;
        const normalizedTarget = target && Object.keys(target).length ? target : null;
        setTutorLaunchTarget(normalizedTarget);
        const nextHash = buildHashForView('tutor', normalizedTarget, appMode);
        if (window.location.hash === nextHash) return;
        if (replace) {
            window.history.replaceState(null, '', nextHash);
        } else {
            window.location.hash = nextHash;
        }
    };

    const homeNavItems = [
        {
            id: 'practice',
            label: 'Practice',
            action: () => goTo('tutor', { tutorTarget: { tab: 'practice' } }),
        },
        {
            id: 'explore',
            label: 'Explore',
            action: () => goTo('library'),
        },
        {
            id: 'create',
            label: 'Create',
            action: () => goTo('transcribe'),
        },
        {
            id: 'basics',
            label: 'Start Learning',
            action: () => {
                setAppMode('beginner');
                setQuizActive(true);
            },
        },
        {
            id: 'about',
            label: 'About',
            action: () => {
                openAbout();
            },
        },
    ];

    return (
        <>
            <SessionDiagnostic
                active={diagnosticActive}
                userId={userId}
                getToken={getToken}
                onNavigate={(view) => {
                    setDiagnosticActive(false);
                    goToAdvanced(view);
                }}
                onDismiss={() => {
                    setDiagnosticActive(false);
                    enterWorkspace('musician');
                }}
            />
            <OnboardingQuiz
                active={quizActive}
                onDismiss={() => setQuizActive(false)}
                onModeSelected={(mode) => setAppMode(mode)}
                userId={userId}
                getToken={getToken}
                onNavigate={(dest) => {
                    setQuizActive(false);
                    goTo(dest.view, { modeOverride: dest.mode || null });
                }}
            />
            <OnboardingTour
                active={tourActive} 
                onDismiss={() => {
                    setTourActive(false);
                    setShowFeatures(false);
                }}
                onStartLearning={() => {
                    setTourActive(false);
                    goTo('tutor');
                }}
                onOpenWorkspace={() => enterWorkspace('musician')}
                onGoTo={goTo}
            />

            {/* ══ ABOUT MODAL ══ */}
            {aboutOpen && createPortal(
                <div
                    className="fixed inset-0 z-[9980] flex items-center justify-center p-3 sm:p-6 lg:p-10"
                    style={{ background: 'rgba(8,3,1,0.72)', backdropFilter: 'blur(6px)' }}
                    onClick={() => closeAbout()}
                >
                    <div
                        className="relative w-full max-w-[1320px] rounded-[24px] sm:rounded-[32px] overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.7)] border border-c-gold/10 animate-fade-in"
                        style={{ minHeight: 'min(680px, 92vh)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Full-bleed image — sits on right, fades out toward left */}
                        <div className="absolute inset-0">
                            <img
                                src="/diya-and-veena.png"
                                alt=""
                                className="w-full h-full object-cover object-center"
                            />
                            {/* Mobile: near-opaque overlay so image is barely visible */}
                            <div className="absolute inset-0 bg-[#070201]/95 lg:hidden" />
                            {/* Desktop: left=solid dark, right=transparent so image shows cleanly */}
                            <div
                                className="absolute inset-0 hidden lg:block"
                                style={{ background: 'linear-gradient(to right, #070201 0%, #070201 24%, rgba(7,2,1,0.88) 34%, rgba(7,2,1,0.3) 48%, transparent 62%)' }}
                            />
                            {/* Top/bottom depth */}
                            <div className="absolute inset-0 bg-gradient-to-b from-[#0c0301]/55 via-transparent to-[#0c0301]/65" />
                        </div>

                        {/* Close button */}
                        <button
                            onClick={() => closeAbout()}
                            className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full text-white/40 hover:text-white/80 hover:bg-white/10 transition-all text-sm"
                        >
                            ✕
                        </button>

                        {/* Scrollable content wrapper — prevents clipping on short mobile screens */}
                        <div className="relative z-10 overflow-y-auto max-h-[92vh]" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <div
                            className="grid min-h-[min(680px,92vh)] lg:grid-cols-[54%_46%]"
                            style={{ minHeight: 'min(680px, 92vh)' }}
                        >
                            <div className="flex items-start lg:items-center pt-14 pb-8 px-5 sm:pt-10 sm:pb-10 sm:px-8 md:px-12 lg:pt-0 lg:pb-0 lg:px-14 xl:px-16">
                                <div className="w-full max-w-[560px]">
                                    <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: 'rgba(247,214,134,0.6)' }}>
                                        About Ālāpana
                                    </p>
                                    <h2 className="font-playfair text-c-gold-light text-[2rem] sm:text-[2.7rem] md:text-[3.4rem] leading-[1.04] tracking-[-0.025em] font-medium mb-5">
                                        A practice agent for self-directed Carnatic learners.
                                    </h2>
                                    <p className="text-[0.98rem] sm:text-[1.04rem] leading-[1.82] mb-4" style={{ color: 'rgba(243,234,214,0.88)' }}>
                                        Self-guided Carnatic learners often practice without timely feedback, without a record of recurring mistakes, and without a clear next step. Ālāpana closes that loop.
                                    </p>
                                    <p className="text-[0.95rem] sm:text-[1.01rem] leading-[1.82]" style={{ color: 'rgba(243,234,214,0.62)' }}>
                                        Ālāpana is a Carnatic solo-practice agent that listens to your singing, remembers your recurring mistakes, and prescribes the next best exercise.
                                    </p>

                                    <div className="mt-8 grid gap-3 sm:grid-cols-3">
                                        {[
                                            {
                                                title: 'Listens',
                                                body: 'Dhwani detects notes in real time. Viveka catches phrase-level raga confusion. First, the app hears what you\'re singing.',
                                            },
                                            {
                                                title: 'Remembers',
                                                body: 'MongoDB tracks which ragas you confuse, what you keep getting wrong, and when you last practiced each one.',
                                            },
                                            {
                                                title: 'Guides',
                                                body: 'Your coach reads your history and prescribes a specific next exercise — not a generic suggestion, but the exact phrase to work on today.',
                                            },
                                        ].map(({ title, body }) => (
                                            <div
                                                key={title}
                                                className="rounded-[18px] border border-c-gold/12 bg-[rgba(14,5,2,0.52)] px-4 py-4 backdrop-blur-[2px]"
                                            >
                                                <div className="text-[10px] uppercase tracking-[0.22em] text-c-gold/80 font-bold">
                                                    {title}
                                                </div>
                                                <p className="mt-2 text-[12px] sm:text-[12.5px] leading-[1.7]" style={{ color: 'rgba(243,234,214,0.78)' }}>
                                                    {body}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                                        <button
                                            onClick={() => closeAbout()}
                                            className="inline-flex items-center justify-center gap-3 rounded-[14px] bg-c-gold px-6 sm:px-7 py-3 sm:py-3.5 text-c-bg text-[11px] font-bold uppercase tracking-[0.15em] shadow-[0_8px_24px_rgba(199,139,34,0.18)] transition-all hover:bg-[#f0c664]"
                                        >
                                            Back to Home
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* Empty right col — image shows through the gradient */}
                            <div className="hidden lg:block" />
                        </div>
                        </div>{/* end scrollable wrapper */}
                    </div>
                </div>,
                document.body
            )}

            {/* ══ UNIFIED MODAL (PORTAL) ══ */}
            {selectedRaga && createPortal(
                <div 
                    className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 bg-c-bg/95 backdrop-blur-md animate-fade-in" 
                    onClick={() => setSelectedRaga(null)}
                >
                    <div 
                        className="bg-c-surface border border-c-border/40 rounded-xl shadow-[0_0_60px_rgba(0,0,0,0.9)] max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-hide relative" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Sticky Header - Solid background forced */}
                        <div className="sticky top-0 bg-[#F3EAD6] border-b border-c-border/20 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center z-30">
                            <div className="flex flex-col">
                                <h3 className="font-playfair text-c-gold text-sm italic tracking-widest uppercase">
                                    {selectedRaga.type === 'melakarta' ? `Melakarta ${selectedRaga.raga.number}` : 'Raagam Profile'}
                                </h3>
                                {selectedRaga.hasClearMatch && (
                                    <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter">High Confidence Match</span>
                                )}
                            </div>
                            <button 
                                onClick={() => setSelectedRaga(null)} 
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-c-border/20 hover:bg-c-gold/20 text-c-cream-dim hover:text-c-gold transition-all duration-300"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 sm:p-6 md:p-8">
                            {selectedRaga.type === 'melakarta' && !RAGAS[selectedRaga.raga.ragaKey] ? (
                                <div className="text-center py-6">
                                    <h2 className="font-playfair text-3xl sm:text-4xl md:text-5xl text-c-gold mb-6 sm:mb-8">{selectedRaga.raga.name}</h2>
                                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
                                        {selectedRaga.raga.notes.map((note, i) => (
                                            <React.Fragment key={i}>
                                                <span className="font-mono text-base md:text-lg text-c-cream bg-c-card px-4 py-2 rounded-lg border border-c-border/40 shadow-sm">
                                                    {note}
                                                </span>
                                                {i < selectedRaga.raga.notes.length - 1 && (
                                                    <span className="text-c-border text-sm">→</span>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        <span className="text-c-border text-sm">→</span>
                                        <span className="font-mono text-base md:text-lg text-c-cream-dark bg-c-card px-4 py-2 rounded-lg border border-c-border/40 shadow-sm opacity-60">
                                            Sa
                                        </span>
                                    </div>
                                    <p className="mt-8 text-xs text-c-cream-dark font-playfair italic max-w-md mx-auto">
                                        This Melakarta hasn't been fully documented with lore and mood yet, but its scale is mathematically defined above.
                                    </p>
                                </div>
                            ) : (
                                <RagaDetail
                                    raga={selectedRaga.type === 'melakarta' ? { name: selectedRaga.raga.name, ...RAGAS[selectedRaga.raga.ragaKey] } : selectedRaga.raga}
                                    hasClearMatch={selectedRaga.hasClearMatch}
                                    initialSaHz={saFrequency}
                                />
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <div className="min-h-screen bg-c-bg text-c-cream flex flex-col relative">
            {/* Global Texture Overlay for Nostalgic Feel */}
            <div className="texture-overlay" />

            {/* ── Mobile Menu Overlay ── */}
            {mobileMenuOpen && (
                <div 
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                >
                    <div 
                        className="mt-auto bg-c-card border-t border-c-gold/20 p-4 pb-8 animate-fade-in"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className="font-playfair text-c-gold text-sm tracking-widest uppercase">Navigate</span>
                            <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-c-border/20 text-c-cream-dim text-sm">✕</button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {visibleFeatures.map(({ id, label, mobileSymbol }) => (
                                <button
                                    key={id}
                                    onClick={() => { goTo(id); setMobileMenuOpen(false); }}
                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                                        view === id
                                            ? 'border-c-gold bg-c-gold/10 text-c-gold'
                                            : 'border-c-border bg-c-surface text-c-cream-dim active:bg-c-gold/10'
                                    }`}
                                >
                                    <span className="text-c-gold">{renderTabIcon(id, "w-5 h-5")}</span>
                                    <span className="text-[10px] font-playfair font-bold uppercase tracking-wide">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Top Nav ── */}
            {view !== 'home' && (
            <nav className={`border-b px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-40 shadow-md backdrop-blur-md ${
                view === 'home' && showFeatures
                    ? 'bg-[rgba(12,5,2,0.92)] border-c-gold/10'
                    : 'bg-c-card border-c-border'
            }`}>
                <button
                    onClick={() => goTo('home')}
                    className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity"
                >
                    <div className={view === 'home' && showFeatures ? 'text-c-gold' : ''}>
                        <VeenaIcon />
                    </div>
                    <div>
                        <div className="font-playfair text-c-gold text-base md:text-lg leading-none">Ālāpana</div>
                        <div className={`text-[8px] md:text-[9px] tracking-widest uppercase ${
                            view === 'home' && showFeatures ? 'text-c-gold/70' : 'text-c-cream-dark'
                        }`}>Solo Practice</div>
                    </div>
                </button>

                {/* Desktop nav tabs */}
                <div className="hidden md:flex items-center gap-1 overflow-x-auto scrollbar-hide">
                    {(view === 'home'
                        ? homeNavItems
                        : visibleFeatures.map(({ id, label }) => ({ id, label, action: () => goTo(id) }))
                    ).map(({ id, label, action }) => (
                        <button
                            key={id}
                            onClick={action}
                            className={`px-4 py-2 text-[11px] font-playfair font-bold tracking-[0.1em] uppercase transition-all duration-300 relative flex-shrink-0 ${
                                view !== 'home' && (view === id || (id === 'avabodha' && (view === 'listen' || view === 'viveka')))
                                    ? 'text-c-gold'
                                    : view === 'home' && showFeatures
                                        ? 'text-c-gold/90 hover:text-c-gold-light'
                                        : 'text-c-cream-dim hover:text-c-gold/60'
                            }`}
                        >
                            {label}
                            {view !== 'home' && (view === id || (id === 'avabodha' && (view === 'listen' || view === 'viveka'))) && (
                                <span className="absolute bottom-1 left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-c-gold to-transparent" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Mobile hamburger + auth */}
                <div className="flex items-center gap-3">
                    {isSignedIn ? (
                        <UserButton />
                    ) : (
                        <SignInButton mode="modal">
                            <button className="text-[11px] font-playfair font-bold tracking-[0.1em] uppercase text-c-cream-dim hover:text-c-gold/60 transition-all px-1">
                                Sign in
                            </button>
                        </SignInButton>
                    )}
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-c-surface transition-colors"
                    >
                        <span className={`block w-5 h-0.5 bg-c-gold transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                        <span className={`block w-5 h-0.5 bg-c-gold transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                        <span className={`block w-5 h-0.5 bg-c-gold transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                    </button>
                </div>
            </nav>
            )}

            {/* ── Mobile bottom tab bar ── */}
            {view !== 'home' && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-c-card border-t border-c-border flex items-stretch overflow-x-auto scrollbar-hide shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
                    {visibleFeatures.map(({ id, mobileSymbol, label }) => (
                        <button
                            key={id}
                            onClick={() => goTo(id)}
                            className={`flex flex-col items-center justify-center gap-0.5 flex-shrink-0 px-3 py-2 min-w-[56px] transition-all ${
                                view === id
                                    ? 'text-c-gold border-t-2 border-c-gold -mt-0.5'
                                    : 'text-c-cream-dark border-t-2 border-transparent -mt-0.5'
                            }`}
                        >
                            {renderTabIcon(id, "w-5 h-5")}
                            <span className="text-[8px] font-bold uppercase tracking-tight leading-none">{label}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Page content ── */}
            <div className={`flex-1 flex flex-col items-center w-full md:pb-0${view !== 'home' ? ' pb-16' : ''}`}>

                {/* ══ HOME ══ */}
                {view === 'home' && (
                        <div
                            className="w-full flex flex-col items-center relative overflow-hidden scrollbar-hide transition-all duration-1000 animate-fade-in bg-[#1a0804]"
                            style={{
                                minHeight: '100vh',
                            }}
                        >
                        {/* Immersive Background Images (Crossfade based on state) */}
                        <div className="absolute inset-0 z-0 pointer-events-none">
                            {/* Main Home Background */}
                            <img 
                                src="/home.png" 
                                alt="" 
                                className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-[350ms]"
                                style={{ opacity: isWorkspaceExpanded ? 0 : 0.8 }}
                            />
                            {/* Workspace portrait background */}
                            <div
                                className="absolute inset-0 transition-opacity duration-[350ms]"
                                style={{ opacity: isWorkspaceExpanded ? 0.96 : 0 }}
                            >
                                <div className="absolute inset-0 bg-[#1a0804]" />
                                <img
                                    src="/workspace-border-full.png"
                                    alt=""
                                    className="absolute inset-y-0 left-1/2 h-full w-auto max-w-none -translate-x-1/2 scale-x-[1.01] sm:scale-x-[1.035]"
                                    style={{ filter: 'brightness(0.72) saturate(0.9)' }}
                                />
                                <div className="absolute inset-0 bg-[rgba(16,6,2,0.24)]" />
                                <div className="absolute inset-x-0 top-0 h-[14%] bg-gradient-to-b from-[#120502]/42 to-transparent" />
                                <div className="absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-t from-[#0f0402]/52 to-transparent hidden sm:block" />
                            </div>
                        </div>
                        {/* Vignette Overlay */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-[1]" />
                        
                        {/* Subtle Noise/Texture Overlay */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay z-[2] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]" />

                        {/* Glow */}
                        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] sm:h-[620px] sm:w-[620px] md:h-[800px] md:w-[800px] bg-c-gold/10 blur-[100px] sm:blur-[140px] md:blur-[160px] pointer-events-none rounded-full z-0" />

                        {/* Hero mandala — fades out when features panel opens */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none w-[110vw] h-[110vw] z-0"
                            style={{
                                maskImage: 'radial-gradient(ellipse 48% 48% at 50% 50%, black 40%, transparent 80%)',
                                WebkitMaskImage: 'radial-gradient(ellipse 48% 48% at 50% 50%, black 40%, transparent 80%)',
                                opacity: showFeatures ? 0 : 0.12,
                                transition: 'opacity 1.4s ease-in-out',
                            }}
                        >
                            <img
                                src="/hero-mandala.jpg"
                                alt=""
                                className="w-full h-full object-cover"
                                style={{
                                    filter: 'invert(1) sepia(1) saturate(500%) hue-rotate(-20deg) brightness(0.8)',
                                    mixBlendMode: 'screen',
                                    animation: 'spin 240s linear infinite',
                                }}
                            />
                        </div>

                        {/* New mandala — fades in when features panel opens, spins counter-clockwise. Fades out when workspace expands */}
                        <div className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 pointer-events-none w-[160vw] h-[160vw] z-0"
                            style={{
                                maskImage: 'radial-gradient(ellipse 45% 45% at 50% 50%, black 30%, transparent 75%)',
                                WebkitMaskImage: 'radial-gradient(ellipse 45% 45% at 50% 50%, black 30%, transparent 75%)',
                                opacity: showFeatures ? (isWorkspaceExpanded ? 0 : 0.15) : 0,
                                transition: 'opacity 1.4s ease-in-out',
                            }}
                        >
                            <img
                                src="/newmandala.png"
                                alt=""
                                className="w-full h-full object-contain"
                                style={{
                                    filter: 'invert(1) sepia(1) saturate(500%) hue-rotate(-20deg) brightness(0.8)',
                                    mixBlendMode: 'screen',
                                    animation: 'spin 240s linear infinite reverse',
                                }}
                            />
                        </div>



                            <div
                                className="relative z-10 w-full max-w-6xl px-4 sm:px-7"
                                style={{ minHeight: 'calc(100vh - 73px)', paddingTop: '1.25rem', paddingBottom: '2rem' }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        paddingTop: '1.25rem',
                                        paddingBottom: '2rem',
                                        opacity: isWorkspaceExpanded ? 0 : 1,
                                        transition: 'opacity 250ms ease',
                                        pointerEvents: isWorkspaceExpanded ? 'none' : 'auto',
                                    }}
                                >
                                    <div className="flex items-center gap-4 sm:gap-6 w-full max-w-xs sm:max-w-sm opacity-90">
                                        <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-c-gold/50 to-transparent" />
                                        <div className="drop-shadow-[0_0_12px_rgba(200,148,31,0.6)] scale-110"><VeenaIcon /></div>
                                        <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent via-c-gold/50 to-transparent" />
                                    </div>

                                <div
                                    className="flex flex-col items-center text-center max-w-3xl"
                                    style={{
                                        opacity: isPreviewOpen ? 0.12 : 1,
                                            transition: 'opacity 250ms ease, filter 250ms ease',
                                            pointerEvents: showFeatures ? 'none' : 'auto',
                                            filter: isPreviewOpen ? 'blur(2px)' : 'none',
                                            marginTop: '2.25rem',
                                        }}
                                    >
                                        <h1
                                            id="tour-logo"
                                            className="font-playfair text-4xl sm:text-6xl md:text-8xl text-transparent bg-clip-text bg-gradient-to-br from-c-gold-light via-[#f7d686] to-[#b88014] tracking-wider uppercase leading-none mb-4 drop-shadow-xl"
                                            style={{ textShadow: '0 4px 30px rgba(227,168,33,0.4)' }}
                                        >
                                            Ālāpana
                                        </h1>
                                        <p className="mb-4 max-w-[22rem] text-[9px] sm:max-w-none sm:text-[11px] md:text-xs uppercase tracking-[0.18em] sm:tracking-[0.22em]" style={{ color: 'rgba(247, 214, 134, 0.76)' }}>
                                            Practicing Carnatic music alone is hard · Ālāpana listens, remembers what you struggle with, guides your next step
                                        </p>
                                        {isSignedIn ? (
                                            <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                                                <button
                                                    onClick={() => setDiagnosticActive(true)}
                                                    className="group bg-c-gold hover:bg-[#f7d686] text-c-bg font-playfair font-bold px-7 sm:px-10 py-3 rounded-full text-xs sm:text-sm tracking-[0.14em] sm:tracking-[0.16em] uppercase transition-all duration-500 shadow-[0_0_36px_rgba(200,148,31,0.26)] cursor-pointer"
                                                >
                                                    Start My Practice Check
                                                </button>
                                                <button
                                                    onClick={() => enterWorkspace('musician')}
                                                    className="group border border-c-gold/55 hover:border-c-gold text-c-gold hover:text-c-gold-light font-playfair font-bold px-7 sm:px-10 py-3 rounded-full text-xs sm:text-sm tracking-[0.14em] sm:tracking-[0.16em] uppercase transition-all duration-500 cursor-pointer"
                                                >
                                                    Continue My Practice Path
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                                                    <SignInButton mode="modal">
                                                        <button className="group bg-c-gold hover:bg-[#f7d686] text-c-bg font-playfair font-bold px-7 sm:px-10 py-3 rounded-full text-xs sm:text-sm tracking-[0.14em] sm:tracking-[0.16em] uppercase transition-all duration-500 shadow-[0_0_36px_rgba(200,148,31,0.26)] cursor-pointer">
                                                            Sign In To Begin
                                                        </button>
                                                    </SignInButton>
                                                    <SignInButton mode="modal">
                                                        <button className="group border border-c-gold/55 hover:border-c-gold text-c-gold hover:text-c-gold-light font-playfair font-bold px-7 sm:px-10 py-3 rounded-full text-xs sm:text-sm tracking-[0.14em] sm:tracking-[0.16em] uppercase transition-all duration-500 cursor-pointer">
                                                            Create Account
                                                        </button>
                                                    </SignInButton>
                                                </div>
                                            </>
                                        )}
                                        <button
                                            onClick={openAbout}
                                            className="mt-5 text-[9px] sm:text-[10px] uppercase tracking-[0.22em] font-playfair transition-colors duration-300"
                                            style={{ color: 'rgba(247,214,134,0.4)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'rgba(247,214,134,0.7)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(247,214,134,0.4)'}
                                        >
                                            About Ālāpana
                                        </button>
                                    </div>
                                </div>


                                <div
                                    className="w-full max-w-6xl"
                                    style={{
                                        overflow: 'hidden',
                                        maxHeight: isWorkspaceExpanded ? '10000px' : '0',
                                        opacity: isWorkspaceExpanded ? 1 : 0,
                                        transition: isWorkspaceExpanded
                                            ? 'opacity 280ms ease'
                                            : 'opacity 280ms ease, max-height 0s 280ms',
                                        pointerEvents: isWorkspaceExpanded ? 'auto' : 'none',
                                        marginTop: isWorkspaceExpanded ? '0.25rem' : '0',
                                    }}
                                >
                                    <div className="pb-16">

                                        {/* ══ GUIDED PRACTICE BLOCKS ══ */}
                                        <div className="mt-4 sm:mt-5 flex flex-col gap-3 px-1.5 sm:px-2 md:px-3">

                                            {/* Block 1 — Agent recommendation (primary) / static fallback */}
                                            {(workspaceModelLoading || agentRecLoading) ? (
                                                <div className="rounded-[20px] border border-c-gold/12 bg-[rgba(14,6,3,0.94)] px-5 py-5 animate-pulse">
                                                    <div className="h-2.5 w-36 rounded-full bg-c-gold/10 mb-3" />
                                                    <div className="h-4 w-4/5 rounded-full bg-c-gold/6 mb-2" />
                                                    <div className="h-4 w-3/5 rounded-full bg-c-gold/6 mb-4" />
                                                    <div className="h-8 w-40 rounded-xl bg-c-gold/8" />
                                                </div>
                                            ) : agentRec ? (
                                                /* ── Agent-driven recommendation ── */
                                                <div className="rounded-[16px] border border-c-gold/28 bg-[linear-gradient(140deg,rgba(199,139,34,0.09),rgba(7,3,2,0.98))] px-4 py-4">
                                                    <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold/55 font-mono mb-1.5">
                                                        {{ confusion_pair: 'Recurring confusion', stale_raga: 'Return to practice', advance_raga: 'Ready to advance', foundation: 'First session' }[agentRec.priority] || 'Recommended'}
                                                    </p>
                                                    <p className="text-[0.88rem] font-playfair text-white/80 leading-relaxed mb-1.5">{agentRec.reason}</p>
                                                    <p className="text-[0.82rem] font-playfair text-white/55 leading-relaxed mb-3">{agentRec.exercise}</p>
                                                    {agentRec.sessionPlan?.length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                                            {agentRec.sessionPlan.map((step, i) => (
                                                                <span key={i} className="flex items-center gap-1.5">
                                                                    <span className="text-[10px] font-playfair text-white/40 leading-snug">
                                                                        <span className="text-c-gold/60 font-mono">{step.minutes}m</span> · {step.activity}
                                                                    </span>
                                                                    {i < agentRec.sessionPlan.length - 1 && (
                                                                        <span className="text-white/20 text-[10px]">→</span>
                                                                    )}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            onClick={() => routeAgentDest(agentRec.destination)}
                                                            className="text-[10px] font-mono uppercase tracking-widest px-3.5 py-1.5 rounded-lg bg-c-gold text-c-bg font-bold hover:bg-c-gold-light transition-all"
                                                        >
                                                            {agentRec.destination?.view === 'compare' ? 'Compare Ragas →'
                                                            : agentRec.destination?.view === 'shruthi' ? 'Open Shruthi →'
                                                            : agentRec.destination?.raga ? `Practice ${agentRec.destination.raga} →`
                                                            : 'Start Practice →'}
                                                        </button>
                                                        <button onClick={() => goTo('learner-model')} className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/12 text-white/35 hover:border-white/20 hover:text-white/55 transition-colors">Full memory →</button>
                                                    </div>
                                                </div>
                                            ) : workspaceModel ? (
                                                /* ── Static reinforcement fallback ── */
                                                <div className="rounded-[16px] border border-c-gold/22 bg-[linear-gradient(140deg,rgba(199,139,34,0.07),rgba(7,3,2,0.98))] px-4 py-4">
                                                    <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold/50 font-mono mb-1.5">Reinforcement</p>
                                                    <p className="text-[0.85rem] font-playfair text-white/70 leading-relaxed mb-3">
                                                        {workspaceModel.ragaStats?.[0]?.raga
                                                            ? `You're building consistency. Run ${workspaceModel.ragaStats[0].raga} through arohanam and avarohanam today — repetition at this stage is what moves it to muscle memory.`
                                                            : "You're building consistency. Open Gurukul and continue your most recent raga — repetition at this stage is what moves it to muscle memory."}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button onClick={() => goToAdvanced('tutor', { tutorTarget: { tab: 'practice', raga: workspaceModel.ragaStats?.[0]?.raga || null } })} className="text-[10px] font-mono uppercase tracking-widest px-3.5 py-1.5 rounded-lg bg-c-gold text-c-bg font-bold hover:bg-c-gold-light transition-all">
                                                            {workspaceModel.ragaStats?.[0]?.raga ? `Practice ${workspaceModel.ragaStats[0].raga} →` : 'Open Gurukul →'}
                                                        </button>
                                                        <button onClick={() => goTo('learner-model')} className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/12 text-white/35 hover:border-white/20 hover:text-white/55 transition-colors whitespace-nowrap">Full memory →</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="rounded-[16px] border border-white/6 bg-[rgba(10,4,2,0.92)] px-4 py-3 flex items-center justify-between gap-4">
                                                    <div>
                                                        <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold/40 font-mono mb-1">First session</p>
                                                        <p className="text-[0.82rem] font-playfair text-white/55">Open your coach <span className="text-c-gold">🪈</span> for your first prescription — or start with Shruthi to lock in your Sa.</p>
                                                    </div>
                                                    <button onClick={() => goToAdvanced('shruthi')} className="flex-shrink-0 text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/10 text-white/30 hover:border-white/18 hover:text-white/50 transition-colors whitespace-nowrap">Start →</button>
                                                </div>
                                            )}

                                            {/* Block 2 — What you keep getting wrong (confusion pairs) */}
                                            {workspaceBlocks?.confusionPairs?.length > 0 && (
                                                <div className="rounded-[16px] border border-white/6 bg-[rgba(10,4,2,0.92)] px-4 py-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-[8px] uppercase tracking-[0.22em] text-c-gold/45 font-mono">What you keep getting wrong</p>
                                                        <button onClick={() => goTo('learner-model')} className="text-[8px] font-mono uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors">See all →</button>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        {workspaceBlocks.confusionPairs.map((pair, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => goToCompare(pair.raga, pair.confusedWith)}
                                                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/6 hover:bg-white/[0.07] hover:border-white/12 transition-all text-left group"
                                                            >
                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                    <span className="font-playfair text-[12.5px] text-white/75 truncate">{pair.raga}</span>
                                                                    <span className="text-white/20 text-xs flex-shrink-0">↔</span>
                                                                    <span className="font-playfair text-[12.5px] text-white/75 truncate">{pair.confusedWith}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                    <div className="flex gap-0.5">
                                                                        {Array.from({ length: Math.min(pair.count, 5) }).map((_, j) => (
                                                                            <div key={j} className="w-1.5 h-1.5 rounded-full bg-c-gold/35" />
                                                                        ))}
                                                                    </div>
                                                                    <span className="text-[9px] font-mono text-c-gold/50">{pair.count}×</span>
                                                                </div>
                                                                <span className="text-[8px] font-mono uppercase tracking-widest text-white/20 group-hover:text-c-gold/55 transition-colors flex-shrink-0 hidden sm:block">Practice →</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Block 3 — Your next focus (stale / ready-to-advance ragas) */}
                                            {workspaceBlocks?.focusItems?.length > 0 && (
                                                <div className="rounded-[16px] border border-white/6 bg-[rgba(10,4,2,0.92)] px-4 py-3">
                                                    <p className="text-[8px] uppercase tracking-[0.22em] text-c-gold/45 font-mono mb-2">Your next focus</p>
                                                    <div className="flex flex-col gap-1">
                                                        {workspaceBlocks.focusItems.map((item, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => goToAdvanced('tutor', { tutorTarget: { tab: 'practice', raga: item.ragaName || null } })}
                                                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/6 hover:bg-white/[0.07] hover:border-white/12 transition-all text-left group"
                                                            >
                                                                <span className={`text-sm leading-none flex-shrink-0 ${item.urgency === 'high' ? 'text-amber-500/70' : item.urgency === 'medium' ? 'text-c-gold/60' : 'text-emerald-500/60'}`}>{item.icon}</span>
                                                                <p className="text-[12.5px] font-playfair text-white/65 flex-1 leading-snug">{item.text}</p>
                                                                <span className="text-[8px] font-mono uppercase tracking-widest text-white/20 group-hover:text-c-gold/55 transition-colors flex-shrink-0 hidden sm:block">Go →</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                        </div>

                                        {/* ── All tools divider ── */}
                                        <div className="mt-8 sm:mt-10 mb-2 px-1.5 sm:px-2 md:px-3">
                                            <div className="flex items-center gap-4">
                                                <div className="h-px flex-1 bg-c-gold/10" />
                                                <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.28em] text-c-gold/30 font-mono">Reference — when you need to open something specific</p>
                                                <div className="h-px flex-1 bg-c-gold/10" />
                                            </div>
                                        </div>

                                        <section className="mt-4 sm:mt-6 px-1.5 sm:px-2 md:px-3" style={{ opacity: agentRec ? 0.72 : 1, transition: 'opacity 300ms ease' }}>
                                            <div className="rounded-[24px] sm:rounded-[34px] border border-c-gold/18 bg-[linear-gradient(180deg,rgba(14,6,3,0.96),rgba(7,3,2,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.42),0_0_0_1px_rgba(199,139,34,0.08)] overflow-hidden backdrop-blur-md">
                                                <div className="relative z-10 px-4 pt-4 pb-3 sm:px-10">
                                                    <div className="flex items-center justify-center gap-4">
                                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-c-gold/15 to-c-gold/5" />
                                                        <p className="text-[9px] sm:text-[11px] uppercase tracking-[0.18em] sm:tracking-[0.28em] text-c-gold/90 text-center">
                                                            Your Practice Path
                                                        </p>
                                                        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-c-gold/15 to-c-gold/5" />
                                                    </div>
                                                </div>

                                                <div className="relative z-10 grid lg:grid-cols-[31%_69%] gap-0 px-3 pb-3 sm:px-6 sm:pb-6">
                                                    <div className="rounded-[20px] sm:rounded-[28px] bg-[linear-gradient(180deg,rgba(29,12,6,0.62),rgba(12,5,2,0.34))] px-4 py-4 sm:px-7 sm:py-6 backdrop-blur-sm">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 sm:w-14 sm:h-14 rounded-full border border-c-gold/16 bg-[rgba(199,139,34,0.03)] flex items-center justify-center text-c-gold/90">
                                                                <VeenaIcon />
                                                            </div>
                                                            <h3 className="font-playfair text-c-gold-light text-[2.15rem] sm:text-[2.7rem] leading-none">
                                                                Learn
                                                            </h3>
                                                        </div>

                                                        <p className="mt-3 sm:mt-4 max-w-none sm:max-w-[260px] text-[0.95rem] sm:text-[1.02rem] leading-[1.65] sm:leading-[1.8]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                            Start every practice session here — set your drone, hold the tala, and detect what you are actually singing.
                                                        </p>

                                                        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 max-w-[320px] text-c-gold">
                                                            {[
                                                                { id: 'shruthi', label: 'Shruthi' },
                                                                { id: 'talam', label: 'Talam' },
                                                                { id: 'keyboard', label: 'Keyboard' },
                                                                { id: 'avabodha', label: 'Avabodha' },
                                                            ].map(({ id, label }) => (
                                                                <button
                                                                    key={id}
                                                                    type="button"
                                                                    onClick={() => goToAdvanced(id)}
                                                                    className="flex flex-col items-start gap-2 rounded-[14px] px-2 py-2 -mx-2 text-left transition-all hover:bg-[rgba(255,214,134,0.04)] hover:text-c-gold-light"
                                                                >
                                                                    <div className="text-c-gold/92">
                                                                        {renderTabIcon(id, 'w-7 h-7')}
                                                                    </div>
                                                                    <span className="text-[13px] text-c-gold/92 tracking-[0.02em]">
                                                                        {label}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="hidden md:block mt-4 lg:mt-0 lg:pl-4">
                                                        <div className="rounded-[20px] sm:rounded-[28px] border border-c-gold/14 bg-[radial-gradient(circle_at_50%_24%,rgba(125,56,24,0.18),transparent_28%),linear-gradient(180deg,rgba(22,8,4,0.9),rgba(10,4,2,0.96))] shadow-[inset_0_0_0_1px_rgba(199,139,34,0.04)] overflow-hidden">
                                                            <div className="grid md:grid-cols-4">
                                                                <div
                                                                    className="workspace-preview-panel group sm:min-h-[340px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('shruthi')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'shruthi' ? null : current)}
                                                                >
                                                                    <div className="absolute right-0 top-[18px] bottom-[18px] w-px bg-c-gold/10 hidden md:block" />
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Shruthi</span>
                                                                        <span>~</span>
                                                                    </div>
                                                                    <div className="relative mt-4 h-[156px]">
                                                                        {[0, 0.4].map((delay, i) => (
                                                                            <div
                                                                                key={`sa-${i}`}
                                                                                className="absolute left-1/2 top-1/2 h-[88px] w-[88px] rounded-full border workspace-hover-anim"
                                                                                style={{
                                                                                    borderColor: shruthiPreviewActive ? 'rgba(214,156,68,0.65)' : 'rgba(214,156,68,0.32)',
                                                                                    animation: `shruthiWave 2.88s ease-out ${delay}s backwards infinite`,
                                                                                    transition: 'border-color 240ms ease',
                                                                                }}
                                                                            />
                                                                        ))}
                                                                        {[1.44, 1.84].map((delay, i) => (
                                                                            <div
                                                                                key={`pa-${i}`}
                                                                                className="absolute left-1/2 top-1/2 h-[88px] w-[88px] rounded-full border workspace-hover-anim"
                                                                                style={{
                                                                                    borderColor: shruthiPreviewActive ? 'rgba(195,138,68,0.65)' : 'rgba(195,138,68,0.32)',
                                                                                    animation: `shruthiWave 2.88s ease-out ${delay}s backwards infinite`,
                                                                                    transition: 'border-color 240ms ease',
                                                                                }}
                                                                            />
                                                                        ))}
                                                                        <div
                                                                            className="absolute left-1/2 top-1/2 h-[20px] w-[20px] rounded-full workspace-hover-anim"
                                                                            style={{
                                                                                background: 'radial-gradient(circle at 35% 35%, rgba(246,219,164,0.98), rgba(205,144,48,0.88) 42%, rgba(99,44,18,0.95) 72%)',
                                                                                boxShadow: shruthiPreviewActive ? '0 0 24px rgba(214,156,68,0.5)' : '0 0 8px rgba(214,156,68,0.12)',
                                                                                transition: 'box-shadow 240ms ease',
                                                                                animation: 'shruthiPulse 1.44s ease-in-out backwards infinite',
                                                                            }}
                                                                        />
                                                                        <span
                                                                            className="absolute text-[9px] uppercase tracking-[0.18em]"
                                                                            style={{
                                                                                color: 'rgba(214,156,68,0.8)',
                                                                                left: 'calc(50% - 22px)',
                                                                                bottom: '4px',
                                                                                transform: 'translateX(-50%)',
                                                                                animation: 'shruthiSaLabel 2.88s ease-in-out infinite',
                                                                                animationPlayState: shruthiPreviewActive ? 'running' : 'paused',
                                                                            }}
                                                                        >Sa</span>
                                                                        <span
                                                                            className="absolute text-[9px] uppercase tracking-[0.18em]"
                                                                            style={{
                                                                                color: 'rgba(214,156,68,0.4)',
                                                                                left: 'calc(50% + 16px)',
                                                                                bottom: '4px',
                                                                                animation: 'shruthiPaLabel 2.88s ease-in-out infinite',
                                                                                animationPlayState: shruthiPreviewActive ? 'running' : 'paused',
                                                                            }}
                                                                        >Pa</span>
                                                                    </div>
                                                                    <div className="mt-2 space-y-1 text-xs" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <div className="flex justify-between">
                                                                            <span className="text-[9px] uppercase tracking-[0.16em]">Sa · Pa</span>
                                                                            <span>Drone</span>
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Locking in your Sa, warming up the voice, and keeping a steady drone through practice.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="workspace-preview-panel group sm:min-h-[340px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('talam')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'talam' ? null : current)}
                                                                >
                                                                    <div className="absolute right-0 top-[18px] bottom-[18px] w-px bg-c-gold/10 hidden md:block" />
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Talam</span>
                                                                        <span>~</span>
                                                                    </div>
                                                                    <div className="mt-5 flex flex-col items-center">
                                                                        <p className="text-sm" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>Adi Talam</p>
                                                                        <div className="mt-3 relative h-[128px] w-[128px] transition-transform duration-500 group-hover:scale-[1.03]">
                                                                            <div
                                                                                className="workspace-hover-reveal workspace-hover-anim absolute left-1/2 top-1/2 h-[136px] w-[136px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-c-gold/10"
                                                                                style={{ animation: 'talaBeatPulse 0.72s ease-out infinite' }}
                                                                            />
                                                                            <div
                                                                                className="absolute left-1/2 top-1/2 h-[116px] w-[116px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                                                                                style={{
                                                                                    border: '1px solid rgba(199,139,34,0.18)',
                                                                                    boxShadow: 'inset 0 0 0 1px rgba(199,139,34,0.02)',
                                                                                }}
                                                                            />
                                                                            {Array.from({ length: 8 }).map((_, index) => {
                                                                                const angle = ((index / 8) * Math.PI * 2) - Math.PI / 2;
                                                                                const active = talamPreviewActive && practiceDemoBeat === index;
                                                                                return (
                                                                                    <span
                                                                                        key={index}
                                                                                        className="absolute h-[10px] w-[10px] rounded-full"
                                                                                        style={{
                                                                                            left: `calc(50% + ${Math.cos(angle) * 52}px)`,
                                                                                            top: `calc(50% + ${Math.sin(angle) * 52}px)`,
                                                                                            transform: active ? 'translate(-50%, -50%) scale(1.5)' : 'translate(-50%, -50%)',
                                                                                            background: active ? '#d7a448' : 'rgba(199,139,34,0.2)',
                                                                                            boxShadow: active ? '0 0 20px 3px rgba(215,164,72,0.75)' : 'none',
                                                                                            transition: 'all 110ms ease',
                                                                                        }}
                                                                                    />
                                                                                );
                                                                            })}
                                                                            <div className="absolute inset-[20px] rounded-full border border-c-gold/10 transition-all duration-300 group-hover:border-c-gold/20" />
                                                                            <div className="absolute left-1/2 top-1/2 h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#d7a448,rgba(110,56,23,0.92))]" />
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Keeping tala steadily while you sing, practice exercises, or work through compositions.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="workspace-preview-panel group sm:min-h-[340px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('keyboard')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'keyboard' ? null : current)}
                                                                >
                                                                    <div className="absolute right-0 top-[18px] bottom-[18px] w-px bg-c-gold/10 hidden md:block" />
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Keyboard</span>
                                                                        <span>~</span>
                                                                    </div>
                                                                    <div className="mt-5 text-center">
                                                                        <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>Scale</div>
                                                                        <div className="relative mx-auto mt-2 w-fit overflow-hidden">
                                                                            <div
                                                                                className="workspace-hover-reveal workspace-hover-anim absolute inset-y-0 -left-12 w-10 bg-[linear-gradient(90deg,transparent,rgba(247,214,134,0.28),transparent)]"
                                                                                style={{ animation: 'keyboardShimmer 2.2s ease-in-out infinite' }}
                                                                            />
                                                                            <div className="text-sm transition-all duration-500 group-hover:tracking-[0.05em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                                Mayamalavagowla
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-5 grid grid-cols-8 gap-1 sm:gap-1.5">
                                                                            {PRACTICE_DEMO_SWARA_LABELS.map((swara, index) => {
                                                                                const active = keyboardPreviewActive && practiceDemoKeyIndex === index;
                                                                                return (
                                                                                    <div
                                                                                        key={`${swara}-${index}`}
                                                                                        className="rounded-[7px] sm:rounded-[9px] py-3 sm:py-4 text-[9px] sm:text-[10px] font-semibold transition-all duration-300"
                                                                                        style={{
                                                                                            color: active ? '#1a0804' : 'rgba(243, 234, 214, 0.92)',
                                                                                            background: active
                                                                                                ? 'linear-gradient(180deg, #f2ce7a, #c98f33)'
                                                                                                : 'rgba(255,245,225,0.05)',
                                                                                            boxShadow: active ? '0 8px 18px rgba(201,143,51,0.28)' : 'inset 0 0 0 1px rgba(199,139,34,0.06)',
                                                                                            transform: active ? 'translateY(-3px)' : 'translateY(0)',
                                                                                        }}
                                                                                    >
                                                                                        {swara}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Hearing swaras one by one, understanding scale shape, and internalizing intervals visually.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="workspace-preview-panel avabodha-preview-panel group sm:min-h-[340px] px-4 sm:px-5 py-4 sm:py-5 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => {
                                                                        setHoveredWorkspacePreview('avabodha');
                                                                        setAvabodhaPreviewStarted(true);
                                                                    }}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'avabodha' ? null : current)}
                                                                >
                                                                    <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Avabodha</span>
                                                                        <span className="ml-2 text-[8px] font-mono tracking-widest" style={{ color: 'rgba(214,156,68,0.45)' }}>Dhwani · Viveka</span>
                                                                    </div>
                                                                    <div className="mt-5 flex flex-col items-center gap-4">
                                                                        <div className="avabodha-preview-modes flex flex-col items-center justify-center">
                                                                            <div className="relative flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-full">
                                                                                <div className="absolute inset-0 rounded-full border border-c-gold/12" />
                                                                                {avabodhaPreviewMode === 'dhwani' ? (
                                                                                    <>
                                                                                        <div
                                                                                            className="absolute inset-[9px] rounded-full border transition-all duration-300"
                                                                                            style={{
                                                                                                borderColor: 'rgba(199,139,34,0.48)',
                                                                                                boxShadow: avabodhaPreviewActive ? '0 0 14px rgba(199,139,34,0.18)' : 'none',
                                                                                            }}
                                                                                        />
                                                                                        <div
                                                                                            className="avabodha-sweep absolute inset-[11px] rounded-full"
                                                                                            style={{
                                                                                                background: 'conic-gradient(from 0deg, transparent 0deg 304deg, rgba(247,214,134,0.48) 332deg 344deg, transparent 360deg)',
                                                                                                maskImage: 'radial-gradient(circle, transparent 59%, black 62%, black 69%, transparent 72%)',
                                                                                                WebkitMaskImage: 'radial-gradient(circle, transparent 59%, black 62%, black 69%, transparent 72%)',
                                                                                            }}
                                                                                        />
                                                                                        <div className="absolute left-1/2 top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#d7a448,rgba(93,43,18,0.96))] flex items-center justify-center">
                                                                                            <div className="h-[6px] w-[6px] rounded-full bg-[#160603]" />
                                                                                        </div>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <div
                                                                                            className="avabodha-sweep absolute inset-[11px] rounded-full border border-c-gold/20"
                                                                                            style={{
                                                                                                background: 'conic-gradient(from 0deg, rgba(247,214,134,0) 0deg 228deg, rgba(247,214,134,0.18) 266deg 296deg, rgba(247,214,134,0) 332deg 360deg)',
                                                                                                boxShadow: avabodhaPreviewActive ? 'inset 0 0 10px rgba(214,156,68,0.08)' : 'none',
                                                                                            }}
                                                                                        />
                                                                                        <div
                                                                                            className="absolute left-1/2 top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                                                                                            style={{ background: 'radial-gradient(circle at 35% 35%, rgba(246,219,164,0.95), rgba(205,144,48,0.85) 44%, rgba(99,44,18,0.95) 76%)' }}
                                                                                        />
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                            <div className="mt-4 flex min-h-[18px] items-end justify-center gap-[2px]">
                                                                                {avabodhaPreviewMode === 'dhwani' ? (
                                                                                    Array.from({ length: 6 }).map((_, i) => (
                                                                                        <span
                                                                                            key={i}
                                                                                            className="avabodha-voice-bar w-[2px] rounded-full bg-c-gold/55"
                                                                                            style={{ height: `${7 + (i % 3) * 3}px`, animationDelay: `${i * 0.12}s` }}
                                                                                        />
                                                                                    ))
                                                                                ) : (
                                                                                    <div className="text-[9px] text-center" style={{ color: 'rgba(214,156,68,0.65)' }}>
                                                                                        Sa mapping
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="mt-4 flex items-center gap-2 text-[8px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.58)' }}>
                                                                                <span style={{ opacity: avabodhaPreviewMode === 'dhwani' ? 1 : 0.4 }}>Dhwani</span>
                                                                                <span className="h-px w-5 bg-c-gold/20" />
                                                                                <span style={{ opacity: avabodhaPreviewMode === 'viveka' ? 1 : 0.4 }}>Viveka</span>
                                                                            </div>
                                                                            <span className="mt-2 text-[8px] uppercase tracking-[0.14em]" style={{ color: 'rgba(214,156,68,0.5)' }}>
                                                                                {avabodhaPreviewMode === 'dhwani' ? 'Real-time' : 'Phrase'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-[10px] text-center" style={{ color: avabodhaPreviewActive ? 'rgba(243,234,214,0.7)' : 'rgba(243,234,214,0.42)', transition: 'color 280ms ease' }}>
                                                                            Two modes of raga discernment
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Detecting what you're singing right now. Dhwani gives real-time note feedback; Viveka catches phrase-level raga confusion.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        <section className="mt-4 px-1.5 sm:px-2 md:px-3" style={{ opacity: agentRec ? 0.72 : 1, transition: 'opacity 300ms ease' }}>
                                            <div className="rounded-[24px] sm:rounded-[34px] border border-c-gold/18 bg-[linear-gradient(180deg,rgba(14,6,3,0.96),rgba(7,3,2,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.42),0_0_0_1px_rgba(199,139,34,0.08)] overflow-hidden backdrop-blur-md">
                                                <div className="relative z-10 grid lg:grid-cols-[31%_69%] gap-0 px-3 py-3 sm:px-6 sm:py-6">
                                                    <div className="rounded-[20px] sm:rounded-[28px] bg-[linear-gradient(180deg,rgba(29,12,6,0.62),rgba(12,5,2,0.34))] px-4 py-4 sm:px-7 sm:py-6 backdrop-blur-sm">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 sm:w-14 sm:h-14 rounded-full border border-c-gold/16 bg-[rgba(199,139,34,0.03)] flex items-center justify-center text-c-gold/90">
                                                                {renderTabIcon('library', 'w-8 h-8')}
                                                            </div>
                                                            <h3 className="font-playfair text-c-gold-light text-[2.15rem] sm:text-[2.7rem] leading-none">
                                                                Understand
                                                            </h3>
                                                        </div>

                                                        <p className="mt-3 sm:mt-4 max-w-none sm:max-w-[270px] text-[0.95rem] sm:text-[1.02rem] leading-[1.65] sm:leading-[1.8]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                            Know the raga you are practicing — its scale, how it relates to others, and where it sits in the Melakarta system.
                                                        </p>

                                                        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 max-w-[270px] text-c-gold">
                                                            {[
                                                                { id: 'library', label: 'Raga Kosha' },
                                                                { id: 'melakarta', label: 'Melakarta' },
                                                                { id: 'bhedam', label: 'Graha Bhedam' },
                                                            ].map(({ id, label }) => (
                                                                <button
                                                                    key={id}
                                                                    type="button"
                                                                    onClick={() => goToAdvanced(id)}
                                                                    className="flex flex-col items-start gap-2 rounded-[14px] px-2 py-2 -mx-2 text-left transition-all hover:bg-[rgba(255,214,134,0.04)] hover:text-c-gold-light"
                                                                >
                                                                    <div className="text-c-gold/92">
                                                                        {renderTabIcon(id, 'w-7 h-7')}
                                                                    </div>
                                                                    <span className="text-[13px] text-c-gold/92 tracking-[0.02em]">
                                                                        {label}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="hidden md:block mt-4 lg:mt-0 lg:pl-4">
                                                        <div className="rounded-[20px] sm:rounded-[28px] border border-c-gold/14 bg-[radial-gradient(circle_at_50%_22%,rgba(120,53,24,0.18),transparent_30%),linear-gradient(180deg,rgba(20,8,4,0.9),rgba(10,4,2,0.96))] shadow-[inset_0_0_0_1px_rgba(199,139,34,0.04)] overflow-hidden">
                                                            <div className="grid md:grid-cols-3">
                                                                <div
                                                                    className="workspace-preview-panel group min-h-[172px] sm:min-h-[200px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('library')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'library' ? null : current)}
                                                                >
                                                                    <div className="absolute right-0 top-[18px] bottom-[18px] w-px bg-c-gold/10 hidden md:block" />
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Raga Kosha</span>
                                                                        <span>~</span>
                                                                    </div>
                                                                    <div className="workspace-preview-shell workspace-preview-float mt-4 rounded-[15px] px-3 py-3">
                                                                        <div
                                                                            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] transition-all duration-300"
                                                                            style={{
                                                                                color: 'rgba(243, 234, 214, 0.94)',
                                                                                background: libraryPreviewActive ? 'rgba(10,4,2,0.62)' : 'rgba(10,4,2,0.46)',
                                                                                border: libraryPreviewActive ? '1px solid rgba(214,156,68,0.22)' : '1px solid rgba(199,139,34,0.06)',
                                                                                boxShadow: libraryPreviewActive ? '0 0 0 1px rgba(214,156,68,0.08), 0 0 18px rgba(214,156,68,0.1)' : 'none',
                                                                            }}
                                                                        >
                                                                            <span className="text-c-gold/70">⌕</span>
                                                                            <span className="flex-1 truncate" style={{ opacity: libraryPreviewActive ? 0.9 : 0.72 }}>{selectedLibraryEntry.name}</span>
                                                                            <span className="text-[12px] text-c-gold/40 transition-opacity duration-300" style={{ opacity: libraryPreviewActive ? 1 : 0 }}>|</span>
                                                                        </div>
                                                                        <div
                                                                            className="mt-2.5 rounded-[10px] px-2.5 py-2.5 transition-all duration-300"
                                                                            style={{
                                                                                background: libraryPreviewActive ? 'rgba(255,245,225,0.04)' : 'rgba(255,245,225,0.02)',
                                                                                border: libraryPreviewActive ? '1px solid rgba(214,156,68,0.16)' : '1px solid rgba(199,139,34,0.07)',
                                                                            }}
                                                                        >
                                                                            <div className="flex items-center justify-between gap-1.5">
                                                                                <span className="truncate text-[11px]" style={{ color: 'rgba(243,234,214,0.92)' }}>
                                                                                    {selectedLibraryEntry.name}
                                                                                </span>
                                                                                <span
                                                                                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em]"
                                                                                    style={{
                                                                                        color: 'rgba(214,156,68,0.78)',
                                                                                        border: '1px solid rgba(214,156,68,0.18)',
                                                                                        background: 'rgba(214,156,68,0.04)',
                                                                                    }}
                                                                                >
                                                                                    {selectedLibraryEntry.family}
                                                                                </span>
                                                                            </div>
                                                                            <div className="mt-1 text-[9px] uppercase tracking-[0.12em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                                {selectedLibraryEntry.meta}
                                                                            </div>
                                                                            <div className="mt-2.5 flex flex-wrap gap-1">
                                                                                {selectedLibraryEntry.swaras.map((s, i) => (
                                                                                    <span
                                                                                        key={i}
                                                                                        className="rounded-full px-1.5 py-0.5 text-[9px]"
                                                                                        style={{
                                                                                            color: libraryPreviewActive ? 'rgba(243,234,214,0.9)' : 'rgba(243,234,214,0.52)',
                                                                                            background: libraryPreviewActive ? 'rgba(214,156,68,0.1)' : 'rgba(255,245,225,0.03)',
                                                                                            border: libraryPreviewActive ? '1px solid rgba(214,156,68,0.22)' : '1px solid rgba(199,139,34,0.09)',
                                                                                            transition: `all 260ms ease ${i * 35}ms`,
                                                                                            transform: libraryPreviewActive ? 'translateY(0)' : 'translateY(2px)',
                                                                                        }}
                                                                                    >
                                                                                        {s}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-2 text-center text-[8px] uppercase tracking-[0.14em]" style={{ color: 'rgba(214,156,68,0.32)' }}>
                                                                            485 ragas searchable
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Check the raga before or during practice — its scale, mood, and characteristic phrases that define it.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="workspace-preview-panel group min-h-[204px] sm:min-h-[286px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('melakarta')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'melakarta' ? null : current)}
                                                                >
                                                                    <div className="absolute right-0 top-[18px] bottom-[18px] w-px bg-c-gold/10 hidden md:block" />
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Melakarta</span>
                                                                        <span>~</span>
                                                                    </div>
                                                                    <div className="mt-4 text-center">
                                                                        <div className="workspace-preview-float text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                            {selectedExploreRaga.number} / 72
                                                                        </div>
                                                                        <div
                                                                            className="workspace-preview-float relative mx-auto mt-3 h-[160px] w-[160px] sm:h-[188px] sm:w-[188px] rounded-full transition-transform duration-700"
                                                                            style={{ transform: melakartaPreviewActive ? 'scale(1.03)' : 'scale(1)' }}
                                                                        >
                                                                            <div
                                                                                className="absolute inset-0 rounded-full"
                                                                                style={{
                                                                                    transform: `rotate(${explorePreviewWheelRotation}deg)`,
                                                                                    transition: melakartaPreviewActive ? 'transform 1500ms cubic-bezier(0.22, 1, 0.36, 1)' : 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                                                                                }}
                                                                            >
                                                                                <div style={{ animation: melakartaPreviewActive ? 'workspaceOrbit 80s linear infinite' : 'none' }}>
                                                                                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 188 188" fill="none" aria-hidden="true">
                                                                                        <circle
                                                                                            cx="94"
                                                                                            cy="94"
                                                                                            r="93"
                                                                                            stroke="rgba(199,139,34,0.18)"
                                                                                            strokeWidth="1.4"
                                                                                            strokeDasharray="584"
                                                                                            strokeDashoffset={melakartaPreviewActive ? 0 : 584}
                                                                                            style={{ transition: 'stroke-dashoffset 1400ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                                                                                        />
                                                                                        <circle
                                                                                            cx="94"
                                                                                            cy="94"
                                                                                            r="75"
                                                                                            stroke="rgba(199,139,34,0.14)"
                                                                                            strokeWidth="1.1"
                                                                                            opacity={melakartaPreviewActive ? 1 : 0.35}
                                                                                            style={{ transition: 'opacity 900ms ease 220ms' }}
                                                                                        />
                                                                                        <circle
                                                                                            cx="94"
                                                                                            cy="94"
                                                                                            r="46"
                                                                                            stroke="rgba(199,139,34,0.22)"
                                                                                            strokeWidth="1.2"
                                                                                            opacity={melakartaPreviewActive ? 1 : 0.5}
                                                                                            transform={melakartaPreviewActive ? 'scale(1)' : 'scale(0.85)'}
                                                                                            style={{
                                                                                                transformOrigin: '94px 94px',
                                                                                                transition: 'opacity 900ms ease 280ms, transform 900ms cubic-bezier(0.22, 1, 0.36, 1) 280ms',
                                                                                            }}
                                                                                        />
                                                                                    </svg>
                                                                                </div>
                                                                                {['Sa', 'Ri', 'Ga', 'Ma', 'Pa', 'Dha', 'Ni', 'Ni', 'Dha', 'Pa', 'Ma', 'Ga'].map((note, index) => {
                                                                                const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
                                                                                return (
                                                                                    <React.Fragment key={`${note}-${index}`}>
                                                                                        <span
                                                                                            className="absolute text-[12px] transition-all duration-500"
                                                                                            style={{
                                                                                                left: `calc(50% + ${Math.cos(angle) * 58}px)`,
                                                                                                top: `calc(50% + ${Math.sin(angle) * 58}px)`,
                                                                                                transform: 'translate(-50%, -50%)',
                                                                                                color: 'rgba(243, 234, 214, 0.94)',
                                                                                                opacity: melakartaPreviewActive ? 1 : 0.42,
                                                                                                transitionDelay: melakartaPreviewActive ? `${index * 45}ms` : '0ms',
                                                                                            }}
                                                                                        >
                                                                                            {note}
                                                                                        </span>
                                                                                        <span
                                                                                            className="absolute left-1/2 top-1/2 w-px bg-c-gold/12 transition-opacity duration-500"
                                                                                            style={{
                                                                                                height: '64px',
                                                                                                transform: `translate(-50%, -100%) rotate(${(index / 12) * 360}deg)`,
                                                                                                transformOrigin: 'center 64px',
                                                                                                opacity: melakartaPreviewActive ? 1 : 0.2,
                                                                                            }}
                                                                                        />
                                                                                    </React.Fragment>
                                                                                );
                                                                            })}
                                                                            </div>
                                                                            <div
                                                                                className="absolute left-1/2 top-1/2 flex h-[40px] w-[40px] sm:h-[46px] sm:w-[46px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-c-gold/14 bg-[radial-gradient(circle_at_center,rgba(199,139,34,0.22),rgba(32,14,7,0.95))] text-xl sm:text-2xl font-playfair text-c-gold-light transition-all duration-700"
                                                                                style={{
                                                                                    boxShadow: melakartaPreviewActive ? '0 0 24px rgba(214,156,68,0.18)' : '0 0 0 rgba(214,156,68,0)',
                                                                                    transform: `translate(-50%, -50%) scale(${melakartaPreviewActive ? 1 : 0.85})`,
                                                                                }}
                                                                            >
                                                                                {explorePreviewDisplayNumber}
                                                                            </div>
                                                                        </div>
                                                                        <div
                                                                            key={`melakarta-name-${selectedExploreRaga.name}`}
                                                                            className="workspace-preview-float mt-4 text-[0.95rem] sm:text-[1.05rem] transition-all duration-700"
                                                                            style={{
                                                                                color: 'rgba(243, 234, 214, 0.94)',
                                                                                opacity: melakartaPreviewActive ? 1 : 0.92,
                                                                                transform: melakartaPreviewActive ? 'translateY(0)' : 'translateY(2px)',
                                                                                textShadow: melakartaPreviewActive ? '0 0 16px rgba(214,156,68,0.12)' : 'none',
                                                                            }}
                                                                        >
                                                                            {selectedExploreRaga.name}
                                                                        </div>
                                                                        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                                                                            {selectedExploreRaga.scale.split(' ').map((swara, index) => (
                                                                                <span
                                                                                    key={`${selectedExploreRaga.name}-${swara}-${index}`}
                                                                                    className="workspace-preview-float rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] transition-all duration-500"
                                                                                    style={{
                                                                                        color: 'rgba(243, 234, 214, 0.94)',
                                                                                        opacity: melakartaPreviewActive ? 1 : 0.52,
                                                                                        transform: melakartaPreviewActive ? 'translateY(0)' : 'translateY(4px)',
                                                                                        transitionDelay: melakartaPreviewActive ? `${index * 60}ms` : '0ms',
                                                                                    }}
                                                                                >
                                                                                    {swara}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Locate your raga in the 72-parent system to understand which swaras define it and which ragas are adjacent.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="workspace-preview-panel group min-h-[204px] sm:min-h-[286px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('bhedam')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'bhedam' ? null : current)}
                                                                >
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Graha Bhedam</span>
                                                                        <span>↗</span>
                                                                    </div>
                                                                    <div className="workspace-preview-float mt-5 space-y-4">
                                                                        <div>
                                                                            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>Base Raga</div>
                                                                            <div
                                                                                key={`graha-base-${selectedGrahaEntry.base}`}
                                                                                className="mt-2 text-[1.08rem] transition-all duration-500"
                                                                                style={{
                                                                                    color: 'rgba(243, 234, 214, 0.94)',
                                                                                    opacity: bhedamPreviewActive ? 1 : 0.92,
                                                                                    transform: bhedamPreviewActive ? 'translateY(0)' : 'translateY(4px)',
                                                                                }}
                                                                            >
                                                                                {selectedGrahaEntry.base}
                                                                            </div>
                                                                        </div>
                                                                        <div>
                                                                            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>Shift Sa to</div>
                                                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                                {GRAHA_BHEDAM_SWARAS.map((swara, index) => {
                                                                                    const active = explorePreviewShiftIndex === index;
                                                                                    return (
                                                                                        <span
                                                                                            key={swara}
                                                                                            className="relative inline-flex min-w-[36px] justify-center rounded-full px-2 py-1 text-[11px] transition-all duration-300"
                                                                                            style={{
                                                                                                color: active ? '#d7a448' : 'rgba(243, 234, 214, 0.8)',
                                                                                                opacity: active ? 1 : bhedamPreviewActive ? 0.72 : 0.9,
                                                                                                transform: active ? 'translateY(-1px)' : 'translateY(0)',
                                                                                                transitionDelay: `${index * 35}ms`,
                                                                                            }}
                                                                                        >
                                                                                            <span
                                                                                                className="absolute inset-0 rounded-full transition-all duration-300"
                                                                                                style={{
                                                                                                    background: active ? 'radial-gradient(circle, rgba(214,156,68,0.18), transparent 72%)' : 'transparent',
                                                                                                    transform: active ? 'scale(1)' : 'scale(0.7)',
                                                                                                    opacity: active ? 1 : 0,
                                                                                                }}
                                                                                            />
                                                                                            <span className="relative z-[1]">{swara}</span>
                                                                                            <span
                                                                                                className="absolute bottom-[1px] left-[18%] h-px bg-c-gold transition-all duration-300"
                                                                                                style={{
                                                                                                    width: active ? '64%' : '0%',
                                                                                                    opacity: active ? 1 : 0,
                                                                                                }}
                                                                                            />
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                        <div className="relative pt-4">
                                                                            <div
                                                                                className="absolute left-[22px] top-0 h-[1px] bg-[linear-gradient(90deg,rgba(214,156,68,0.75),rgba(214,156,68,0.08))] transition-all duration-500"
                                                                                style={{
                                                                                    width: bhedamPreviewActive ? '96px' : '0px',
                                                                                    opacity: bhedamPreviewActive ? 1 : 0,
                                                                                }}
                                                                            />
                                                                            <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>Becomes</div>
                                                                            <div
                                                                                key={`graha-result-${selectedGrahaSwara}-${selectedGrahaResult}`}
                                                                                className="mt-2 text-[1.08rem] transition-all duration-500"
                                                                                style={{
                                                                                    color: 'rgba(243, 234, 214, 0.94)',
                                                                                    opacity: bhedamPreviewActive ? 1 : 0.92,
                                                                                    transform: bhedamPreviewActive ? 'translateY(0)' : 'translateY(4px)',
                                                                                    textShadow: bhedamPreviewActive ? '0 0 16px rgba(214,156,68,0.12)' : 'none',
                                                                                }}
                                                                            >
                                                                                {selectedGrahaResult}
                                                                            </div>
                                                                        </div>
                                                                        <div className="pt-4">
                                                                            <span
                                                                                className="workspace-preview-float inline-flex items-center gap-2 rounded-full border border-c-gold/10 px-4 py-2 text-[10px] uppercase tracking-[0.16em] transition-all duration-300"
                                                                                style={{
                                                                                    color: 'rgba(243, 234, 214, 0.94)',
                                                                                    background: bhedamPreviewActive ? 'rgba(255,214,134,0.06)' : 'rgba(255,214,134,0.02)',
                                                                                    borderColor: bhedamPreviewActive ? 'rgba(214,156,68,0.28)' : 'rgba(199,139,34,0.1)',
                                                                                    boxShadow: bhedamPreviewActive ? '0 10px 24px rgba(199,139,34,0.12)' : 'none',
                                                                                    transform: bhedamPreviewActive ? 'translateY(0) scale(1.01)' : 'translateY(0) scale(1)',
                                                                                }}
                                                                            >
                                                                                <span style={{ transform: bhedamPreviewActive ? 'translateX(3px)' : 'translateX(0)', transition: 'transform 300ms ease' }}>
                                                                                    See Raga Shifts
                                                                                </span>
                                                                                <ArrowRightMini
                                                                                    className="h-3.5 w-3.5 text-c-gold transition-all duration-300"
                                                                                    style={{
                                                                                        opacity: bhedamPreviewActive ? 1 : 0,
                                                                                        transform: bhedamPreviewActive ? 'translateX(4px)' : 'translateX(0)',
                                                                                    }}
                                                                                />
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Understand why two ragas feel similar — useful when the coach identifies a specific raga confusion to fix.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        <section className="mt-4 px-1.5 sm:px-2 md:px-3" style={{ opacity: agentRec ? 0.72 : 1, transition: 'opacity 300ms ease' }}>
                                            <div className="rounded-[24px] sm:rounded-[34px] border border-c-gold/18 bg-[linear-gradient(180deg,rgba(14,6,3,0.96),rgba(7,3,2,0.98))] shadow-[0_30px_80px_rgba(0,0,0,0.42),0_0_0_1px_rgba(199,139,34,0.08)] overflow-hidden backdrop-blur-md">
                                                <div className="grid lg:grid-cols-[31%_69%] gap-0 px-3 py-3 sm:px-6 sm:py-6">
                                                    <div className="rounded-[20px] sm:rounded-[28px] bg-[linear-gradient(180deg,rgba(29,12,6,0.62),rgba(12,5,2,0.34))] px-4 py-4 sm:px-7 sm:py-8">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border border-c-gold/16 bg-[rgba(199,139,34,0.03)] flex items-center justify-center text-c-gold/90">
                                                                {renderTabIcon('transcribe', 'w-8 h-8')}
                                                            </div>
                                                            <h3 className="font-playfair text-c-gold-light text-[2.15rem] sm:text-[2.7rem] leading-none">
                                                                Correct
                                                            </h3>
                                                        </div>

                                                        <p className="mt-4 sm:mt-6 max-w-none sm:max-w-[270px] text-[0.95rem] sm:text-[1.02rem] leading-[1.65] sm:leading-[1.8]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                            Prescribed correction space — structured exercises and transcription of what you're actually working on.
                                                        </p>

                                                        <div className="mt-6 sm:mt-10 grid grid-cols-2 gap-x-4 gap-y-5 max-w-[220px] text-c-gold">
                                                            {[
                                                                { id: 'transcribe', label: 'Transcribe' },
                                                                { id: 'tutor',      label: 'Gurukul' },
                                                            ].map(({ id, label }) => (
                                                                <button
                                                                    key={id}
                                                                    type="button"
                                                                    onClick={() => goToAdvanced(id, id === 'tutor' ? { tutorTarget: { tab: 'practice' } } : {})}
                                                                    className="flex flex-col items-start gap-2 rounded-[14px] px-2 py-2 -mx-2 text-left transition-all hover:bg-[rgba(255,214,134,0.04)] hover:text-c-gold-light"
                                                                >
                                                                    <div className="text-c-gold/92">
                                                                        {renderTabIcon(id, 'w-7 h-7')}
                                                                    </div>
                                                                    <span className="text-[13px] text-c-gold/92 tracking-[0.02em]">
                                                                        {label}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="hidden md:block mt-4 lg:mt-0 lg:pl-4">
                                                        <div className="rounded-[20px] sm:rounded-[28px] border border-c-gold/14 bg-[radial-gradient(circle_at_54%_18%,rgba(122,54,23,0.18),transparent_26%),linear-gradient(180deg,rgba(20,8,4,0.9),rgba(10,4,2,0.96))] shadow-[inset_0_0_0_1px_rgba(199,139,34,0.04)] overflow-hidden">
                                                            <div className="grid md:grid-cols-2 lg:grid-cols-[0.98fr_1.02fr]">
                                                                <div
                                                                    className="workspace-preview-panel group min-h-[212px] sm:min-h-[286px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('transcribe')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'transcribe' ? null : current)}
                                                                >
                                                                    <div className="absolute right-0 top-[18px] bottom-[18px] w-px bg-c-gold/10 hidden md:block" />
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Transcribe</span>
                                                                        <span>~</span>
                                                                    </div>
                                                                    <div className="workspace-preview-shell workspace-preview-float mt-5 rounded-[16px] px-3 py-4">
                                                                        <div className="flex h-[78px] items-center gap-[2px]">
                                                                            {Array.from({ length: 56 }).map((_, i) => (
                                                                                <span
                                                                                    key={i}
                                                                                    ref={(node) => { transcribeWaveBarRefs.current[i] = node; }}
                                                                                    className="flex-1 origin-center rounded-full bg-[linear-gradient(180deg,rgba(244,214,142,0.95),rgba(164,103,36,0.22))] will-change-transform"
                                                                                    style={{
                                                                                        height: `${14 + (Math.abs(Math.sin(i * 0.42)) * 48)}px`,
                                                                                        transform: 'scaleY(0.92)',
                                                                                        opacity: 0.26 + ((i % 7) * 0.05),
                                                                                    }}
                                                                                />
                                                                            ))}
                                                                        </div>

                                                                        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                                            <div className="relative flex-1 sm:mr-4">
                                                                                <div className="h-[100px] rounded-[12px] bg-[rgba(9,4,2,0.36)] shadow-[inset_0_0_0_1px_rgba(199,139,34,0.06)] px-3 py-3 group-hover:shadow-[inset_0_0_0_1px_rgba(199,139,34,0.12)] transition-shadow duration-500">
                                                                                    <div className="absolute left-3 right-3 top-[18px] h-px bg-c-gold/16" />
                                                                                    <div className="absolute left-3 right-3 top-[33px] h-px bg-c-gold/16" />
                                                                                    <div className="absolute left-3 right-3 top-[48px] h-px bg-c-gold/16" />
                                                                                    <div className="absolute left-3 right-3 top-[63px] h-px bg-c-gold/16" />
                                                                                    <div className="absolute left-3 right-3 top-[78px] h-px bg-c-gold/16" />
                                                                                    <div className="absolute left-[14px] right-[12px] top-[20px] sm:left-[18px] sm:right-[16px] sm:top-[24px] flex flex-wrap items-start gap-x-2 sm:gap-x-3 gap-y-1 text-[11px] sm:text-[12px]">
                                                                                        {currentTranscribePhrase.map((token, index) => {
                                                                                            const revealed = index <= transcribePreviewTokenIndex || transcribePreviewMode === 'processing';
                                                                                            const active = transcribePreviewMode === 'recording' && index === transcribePreviewTokenIndex;
                                                                                            const separator = token === '|';
                                                                                            return (
                                                                                                <span
                                                                                                    key={`${transcribePreviewPhraseIndex}-${token}-${index}`}
                                                                                                    className="transition-all duration-300"
                                                                                                    style={{
                                                                                                        color: active ? '#d7a448' : 'rgba(243, 234, 214, 0.94)',
                                                                                                        opacity: revealed ? 1 : 0,
                                                                                                        transform: revealed ? 'translateY(0)' : 'translateY(8px)',
                                                                                                        textShadow: active ? '0 0 14px rgba(214,156,68,0.24)' : 'none',
                                                                                                        transitionDelay: separator ? '40ms' : `${index * 24}ms`,
                                                                                                    }}
                                                                                                >
                                                                                                    {token}
                                                                                                </span>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-row items-center justify-between sm:flex-col gap-3 sm:gap-2">
                                                                                <div
                                                                                    className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#d66e51,#9e3722_68%,#752313)] transition-all duration-300 ${transcribePreviewMode === 'recording' ? 'workspace-recording-pulse' : ''}`}
                                                                                    style={{
                                                                                        boxShadow: transcribePreviewMode === 'recording'
                                                                                            ? '0 0 28px rgba(218,92,58,0.42)'
                                                                                            : '0 0 18px rgba(185,67,42,0.2)',
                                                                                        transform: transcribePreviewMode === 'processing' ? 'scale(0.96)' : 'scale(1)',
                                                                                    }}
                                                                                >
                                                                                    <div className="w-3 h-3 rounded-sm bg-[#f6dcb2]" />
                                                                                </div>
                                                                                <span
                                                                                    className="text-[11px] transition-all duration-300"
                                                                                    style={{
                                                                                        color: 'rgba(243, 234, 214, 0.94)',
                                                                                        opacity: transcribePreviewMode === 'idle' ? 0.72 : 1,
                                                                                        textShadow: transcribePreviewMode === 'recording' ? '0 0 18px rgba(184,134,46,0.25)' : 'none',
                                                                                    }}
                                                                                >
                                                                                    {`00:${String(transcribePreviewSeconds % 60).padStart(2, '0')}`}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Capture a phrase, sangati, or melodic idea and lay it out in swaras against tala.
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div
                                                                    className="workspace-preview-panel group min-h-[212px] sm:min-h-[286px] px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-[rgba(255,214,134,0.02)]"
                                                                    onMouseEnter={() => setHoveredWorkspacePreview('gurukul')}
                                                                    onMouseLeave={() => setHoveredWorkspacePreview((current) => current === 'gurukul' ? null : current)}
                                                                >
                                                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                        <span>Gurukul</span>
                                                                        <span className="relative" style={{ color: 'rgba(243, 234, 214, 0.94)' }}>
                                                                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 transition-all duration-300" style={{ background: gurukulPreviewMenuOpen ? 'rgba(255,214,134,0.05)' : 'transparent' }}>
                                                                                <span>My Repertoire</span>
                                                                                <span style={{ display: 'inline-block', transform: gurukulPreviewMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>▾</span>
                                                                            </span>
                                                                        </span>
                                                                    </div>
                                                                    <div className="workspace-preview-shell workspace-preview-float mt-5 rounded-[16px] px-3 py-3">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: 'rgba(214,156,68,0.55)' }}>This Week</span>
                                                                            <span className="text-[9px]" style={{ color: 'rgba(214,156,68,0.35)' }}>3 pieces</span>
                                                                        </div>
                                                                        <div className="mt-3 space-y-2">
                                                                            {GURUKUL_PRACTICE_LOG.map(({ name, type, tala, progress, days }, i) => {
                                                                                const active = gurukulPreviewCategoryIndex % 3 === i;
                                                                                return (
                                                                                <div
                                                                                    key={name}
                                                                                    className="rounded-[12px] px-3 py-2.5 transition-all duration-300"
                                                                                    style={{
                                                                                        background: active ? 'rgba(146,96,33,0.16)' : 'rgba(255,245,225,0.02)',
                                                                                        border: active ? '1px solid rgba(199,139,34,0.18)' : '1px solid rgba(199,139,34,0.06)',
                                                                                        boxShadow: active ? '0 0 18px rgba(199,139,34,0.07)' : 'none',
                                                                                        transitionDelay: `${i * 45}ms`,
                                                                                    }}
                                                                                >
                                                                                    <div className="flex items-center justify-between gap-2">
                                                                                        <div className="min-w-0">
                                                                                            <div className="truncate text-[11px]" style={{ color: 'rgba(243,234,214,0.92)' }}>{name}</div>
                                                                                            <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em]" style={{ color: 'rgba(214,156,68,0.52)' }}>{type} · {tala}</div>
                                                                                        </div>
                                                                                        <div className="shrink-0 text-right">
                                                                                            <div className="text-[10px]" style={{ color: active ? 'rgba(214,156,68,0.88)' : 'rgba(243,234,214,0.45)', transition: 'color 300ms ease' }}>{progress}%</div>
                                                                                            <div className="text-[8px] uppercase tracking-[0.12em]" style={{ color: 'rgba(214,156,68,0.32)' }}>{days}d</div>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="mt-2 h-[2px] overflow-hidden rounded-full" style={{ background: 'rgba(199,139,34,0.1)' }}>
                                                                                        <div
                                                                                            className="h-full rounded-full transition-all"
                                                                                            style={{
                                                                                                width: gurukulPreviewActive ? `${progress}%` : '8%',
                                                                                                background: active ? 'linear-gradient(90deg,rgba(214,156,68,0.88),rgba(214,156,68,0.44))' : 'rgba(214,156,68,0.36)',
                                                                                                transitionDuration: '700ms',
                                                                                                transitionDelay: `${i * 120 + 80}ms`,
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                        <div className="mt-3 flex items-center justify-between">
                                                                            <span className="text-[8px] uppercase tracking-[0.14em]" style={{ color: 'rgba(214,156,68,0.28)' }}>Active streaks</span>
                                                                            <div className="flex gap-1">
                                                                                {[14, 7, 3].map((d) => (
                                                                                    <div key={d} className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(214,156,68,0.32)' }} />
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div
                                                                        className="mt-3 rounded-[12px] border px-3 py-2.5"
                                                                        style={{
                                                                            borderColor: 'rgba(199,139,34,0.08)',
                                                                            background: 'rgba(255,245,225,0.02)',
                                                                        }}
                                                                    >
                                                                        <div className="text-[9px] uppercase tracking-[0.16em]" style={{ color: 'rgba(214,156,68,0.52)' }}>
                                                                            Best for
                                                                        </div>
                                                                        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(243,234,214,0.68)' }}>
                                                                            Structured daily riyaz with AI pitch feedback — use when the coach prescribes a specific raga or exercise to work on.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </div>


                    </div>
            )}

                {/* ══ TUTOR ══ */}
                {view === 'tutor' && (
                    <Tutor
                        saFrequency={saFrequency}
                        appMode={appMode}
                        onSadhanaComplete={markSadhanaStep}
                        launchTarget={tutorLaunchTarget}
                        onNavigationChange={handleTutorNavigation}
                        onLaunchHandled={() => {}}
                    />
                )}
                {view === 'transcribe' && <Tutor saFrequency={saFrequency} appMode={appMode} transcribeOnly={true} />}

                {/* ══ AVABODHA (Dhwani + Viveka) ══ */}
                {(view === 'listen' || view === 'avabodha') && (
                    <main className="w-full max-w-3xl mx-auto flex flex-col items-center gap-7 px-4 md:px-8 py-10 animate-fade-in">
                        <div className="w-full flex flex-col items-center gap-7">

                            {/* Dhwani · Viveka sister-tab strip */}
                            <div className="flex gap-1 bg-c-surface border border-c-border rounded-lg p-1 w-full max-w-[260px]">
                                <button
                                    onClick={() => goTo('listen')}
                                    className="flex-1 py-2 flex flex-col items-center gap-0.5 rounded transition-all bg-c-gold text-c-bg"
                                >
                                    <span className="text-[11px] font-semibold font-playfair">Dhwani</span>
                                    <span className="text-[8px] font-mono uppercase tracking-widest opacity-70">real-time</span>
                                </button>
                                <button
                                    onClick={() => goTo('viveka')}
                                    className="flex-1 py-2 flex flex-col items-center gap-0.5 rounded transition-all text-c-cream-dark hover:text-c-cream"
                                >
                                    <span className="text-[11px] font-semibold font-playfair">Viveka</span>
                                    <span className="text-[8px] font-mono uppercase tracking-widest opacity-70">phrase</span>
                                </button>
                            </div>

                            {/* Branded Header Section - Compact */}
                            <div className="w-full flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-c-card border border-c-gold/30 flex items-center justify-center text-c-gold shadow-md backdrop-blur-md relative flex-shrink-0">
                                        <DhwaniIcon className="w-6 h-6 relative z-10" />
                                    </div>
                                    <div className="flex flex-col text-left">
                                        <div className="flex items-center gap-2">
                                            <h1 className="font-playfair text-xl font-bold tracking-wider text-c-gold uppercase leading-none">Dhwani</h1>
                                            <span className="text-[8px] uppercase tracking-widest bg-c-gold/15 text-c-gold px-2 py-0.5 rounded font-semibold border border-c-gold/20 leading-none">Vocal</span>
                                        </div>
                                        <p className="text-c-cream-dim text-[11px] mt-1 font-light leading-none">
                                            Real-time vocal resonance and raga identifier.
                                        </p>
                                    </div>
                                </div>

                                {/* Collapsible guide toggler button */}
                                <button
                                    onClick={() => setShowGuide(!showGuide)}
                                    className="px-3 py-1 rounded-full text-[10px] font-semibold tracking-wider bg-c-gold/15 text-c-gold border border-c-gold/30 hover:bg-c-gold/25 transition-all flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span>{showGuide ? "Hide Guide" : "How to Sing"}</span>
                                    <span className="opacity-80">{showGuide ? "▲" : "▼"}</span>
                                </button>
                            </div>
                            <SketchyRule className="mt-2 opacity-60" />

                            {/* Collapsible How-to card */}
                            {showGuide && (
                                <div className="w-full bg-c-gold-faint border border-c-gold/25 rounded-xl p-4 flex gap-3.5 items-start animate-fade-in">
                                    <div className="text-c-gold flex-shrink-0 mt-0.5">
                                        <DhwaniIcon className="w-5 h-5" />
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        <p className="font-playfair text-c-cream text-sm font-bold">Dhwani: Real-time Raga Recognition</p>
                                        <p className="text-c-cream-dim text-xs leading-relaxed text-left">
                                            Sing any Carnatic melody and Ālāpana listens in real time, detecting each note and matching them to a raga. Switch to the optional <span className="text-c-gold font-semibold">Ālaap AI</span> mode to analyze longer, ornamented phrases.
                                        </p>
                                        <ol className="flex flex-col gap-1.5 text-xs text-c-cream-dim leading-relaxed list-none text-left">
                                            <li className="flex gap-2"><span className="text-c-gold font-bold flex-shrink-0">1.</span><span>Allow microphone access and turn on pitch detection.</span></li>
                                            <li className="flex gap-2"><span className="text-c-gold font-bold flex-shrink-0">2.</span><span>Sing your <span className="text-c-gold font-semibold">Sa</span> — the first note of the Carnatic scale, like "Do" in Do-Re-Mi. It's the note your melody always comes back to and feels settled on. Pick a comfortable pitch and sing it steadily so Ālāpana can lock on to it.</span></li>
                                            <li className="flex gap-2"><span className="text-c-gold font-bold flex-shrink-0">3.</span><span>Sing your melody. Hold each note for a moment so it's detected, then watch the raga suggestions appear.</span></li>
                                        </ol>
                                        <p className="text-[10px] text-c-cream-dark italic border-t border-c-gold/15 pt-2 text-left">
                                            <span className="text-c-gold/80">Standard</span> mode works best for clear, straight notes.&ensp;
                                            <span className="text-c-gold/80">Ālaap AI</span> mode records 30 seconds and uses deep AI to catch subtle, fluid ornaments and gamakams.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Step guide */}
                            <div className="w-full flex items-center gap-2">
                                {[
                                    { n: 1, label: 'Wake the mic' },
                                    { n: 2, label: 'Find your Sa' },
                                    { n: 3, label: 'Sing freely' },
                                ].map(({ n, label }, i, arr) => (
                                    <React.Fragment key={n}>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors ${
                                                step > n
                                                    ? 'border-c-gold bg-c-gold text-c-bg'
                                                    : step === n
                                                    ? 'border-c-gold/60 bg-c-gold-faint text-c-gold'
                                                    : 'border-c-border bg-transparent text-c-cream-dark'
                                            }`}>
                                                {step > n ? '✓' : n}
                                            </div>
                                            <span className={`text-xs hidden sm:block transition-colors ${
                                                step === n ? 'text-c-cream' : step > n ? 'text-c-cream-dim' : 'text-c-cream-dark'
                                            }`}>
                                                {label}
                                            </span>
                                        </div>
                                        {i < arr.length - 1 && (
                                            <div className={`flex-1 h-px ${step > n ? 'bg-c-gold/30' : 'bg-c-border'}`} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>

                            <AudioInput
                                onPitchDetected={handlePitchDetected}
                                onSaSet={setSaFrequency}
                                saFrequency={saFrequency}
                                onStart={() => setIsListening(true)}
                            />

                            {saFrequency && (
                                <div className="w-full">
                                    <button
                                        onClick={handleReset}
                                        className="block mx-auto mb-6 text-xs text-c-cream-dark hover:text-c-gold transition-colors underline underline-offset-2 font-playfair italic"
                                    >
                                        Start fresh
                                    </button>

                                    <div className="flex justify-center mb-8">
                                        <div className="bg-c-card border border-c-border p-1 rounded-full flex items-center shadow-lg">
                                            <button
                                                onClick={() => setActiveMode('standard')}
                                                className={`px-6 py-2 rounded-full text-xs font-playfair tracking-wide transition-all ${
                                                    activeMode === 'standard'
                                                        ? 'bg-c-gold text-c-bg'
                                                        : 'text-c-cream-dim hover:text-c-cream'
                                                }`}
                                            >
                                                Standard
                                            </button>
                                            <button
                                                onClick={() => setActiveMode('gemini')}
                                                className={`px-6 py-2 rounded-full text-xs font-playfair tracking-wide transition-all ${
                                                    activeMode === 'gemini'
                                                        ? 'bg-c-gold text-c-bg'
                                                        : 'text-c-cream-dim hover:text-c-cream'
                                                }`}
                                            >
                                                Ālaap AI
                                            </button>
                                        </div>
                                    </div>

                                    <div className="w-full animate-fade-in">
                                        {activeMode === 'standard' ? (
                                            <div className="flex flex-col items-center w-full pitch-detector-container">
                                                <p className="text-[11px] text-c-cream-dark text-center font-playfair italic mb-5 opacity-80 max-w-sm">
                                                    Detects notes in real time as you sing. Great for beginners — just hold each note clearly and the raga builds up live.
                                                </p>
                                                <RagaDisplay 
                                                    ragas={possibleRagas} 
                                                    detectedNotes={detectedNotes} 
                                                    onRemoveNote={handleRemoveNote} 
                                                    onSelectRaga={(r, clear) => setSelectedRaga({ raga: r, hasClearMatch: clear, type: 'identify' })}
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex flex-col w-full gemini-ai-container">
                                                <p className="text-[11px] text-c-cream-dark text-center font-playfair italic mb-5 opacity-80 max-w-sm mx-auto">
                                                    Records a 30-second phrase, then sends the note sequence to the Ālaap AI model for deeper analysis — better at catching fluid ornaments and complex phrases.
                                                </p>
                                                <GeminiPanel saFrequency={saFrequency} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                )}

                {/* ══ VIVEKA ══ */}
                {view === 'viveka' && (
                    <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-4 px-4 md:px-8 pt-8 animate-fade-in">
                        {/* Dhwani · Viveka sister-tab strip */}
                        <div className="flex gap-1 bg-c-surface border border-c-border rounded-lg p-1 w-full max-w-[260px]">
                            <button
                                onClick={() => goTo('listen')}
                                className="flex-1 py-2 flex flex-col items-center gap-0.5 rounded transition-all text-c-cream-dark hover:text-c-cream"
                            >
                                <span className="text-[11px] font-semibold font-playfair">Dhwani</span>
                                <span className="text-[8px] font-mono uppercase tracking-widest opacity-70">real-time</span>
                            </button>
                            <button
                                onClick={() => goTo('viveka')}
                                className="flex-1 py-2 flex flex-col items-center gap-0.5 rounded transition-all bg-c-gold text-c-bg"
                            >
                                <span className="text-[11px] font-semibold font-playfair">Viveka</span>
                                <span className="text-[8px] font-mono uppercase tracking-widest opacity-70">phrase</span>
                            </button>
                        </div>
                        <Viveka onSelectRaga={(r) => setSelectedRaga(r)} />
                    </div>
                )}

                {view === 'library' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in raga-library-container">
                        <RagaLibrary onSelectRaga={(r) => setSelectedRaga({ raga: r, hasClearMatch: true, type: 'library' })} />
                    </div>
                )}
                {view === 'compare' && compareRagas && (
                    <RagaCompare
                        ragaA={compareRagas.a}
                        ragaB={compareRagas.b}
                        onBack={() => goTo('home')}
                        onPractice={() => goToAdvanced('tutor', { tutorTarget: { tab: 'practice', raga: compareRagas.a } })}
                    />
                )}
                {view === 'melakarta' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in raga-melakarta-chart">
                        <MelakartaChart onSelectRaga={(r) => setSelectedRaga({ raga: r, type: 'melakarta' })} />
                    </div>
                )}
                {view === 'keyboard' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in swara-keyboard-container">
                        <SwaraKeyboard onSadhanaComplete={markSadhanaStep} />
                    </div>
                )}
                {view === 'bhedam' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in">
                        <GrahaBhedam />
                    </div>
                )}
                {view === 'singback' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in">
                        <SingBackChallenge onSadhanaComplete={markSadhanaStep} />
                    </div>
                )}
                {view === 'shruthi' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in">
                        <ShruthiBox onSadhanaComplete={markSadhanaStep} />
                    </div>
                )}
                {view === 'talam' && (
                    <div className="w-full p-4 md:p-8 flex flex-col items-center animate-fade-in">
                        <Talam />
                    </div>
                )}
                {view === 'learner-model' && (
                    <LearnerModelPanel userId={userId} getToken={getToken} agentRec={agentRec} onNavigate={(dest) => {
                        if (dest && typeof dest === 'object') {
                            if (dest.view === 'compare') {
                                goToCompare(dest.ragaA, dest.ragaB);
                            } else if (dest.view === 'tutor' && dest.tutorTarget) {
                                goToAdvanced('tutor', { tutorTarget: dest.tutorTarget });
                            } else {
                                goToAdvanced(dest.view);
                            }
                        } else {
                            goToAdvanced(dest);
                        }
                    }} />
                )}
                {view === 'sadhana' && appMode !== 'beginner' && (
                    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-5 py-16 px-6 text-center animate-fade-in">
                        <p className="font-playfair text-lg text-c-cream-dim italic">Sadhana is part of the Guided Practice path</p>
                        <p className="text-sm text-c-cream-dark max-w-sm leading-relaxed">
                            Daily Sadhana is designed for learners building their foundation. Switch to Guided Practice to access your practice checklist and streak.
                        </p>
                        <button
                            onClick={() => goTo('home', { modeOverride: 'beginner' })}
                            className="px-6 py-2.5 bg-c-gold hover:bg-c-gold-light text-c-bg font-semibold text-sm rounded transition-all"
                        >
                            Switch to Guided Practice
                        </button>
                    </div>
                )}
                {view === 'sadhana' && appMode === 'beginner' && (() => {
                    const steps = [
                        { n: 1, name: 'Tune & Warm Up',  tab: 'shruthi',  desc: 'Drone Baseline Alignment',    longDesc: 'Open the Shruthi Box and sustain a warm "ah" sound along with the drone for 30 seconds to lock in your pitch center.', btnText: 'Launch Shruthi Box' },
                        { n: 2, name: 'Svara Gurukul',  tab: 'tutor',    desc: 'Vocal Academy & Scale Flow',  longDesc: 'Master structured vocal exercises (Varisais) or practice ascending and descending scales under real-time guidance from the AI Guru.', btnText: 'Enter Svara Gurukul' },
                        { n: 3, name: 'Explore Scales',  tab: 'keyboard', desc: 'Swarasthana Visualization',   longDesc: 'Play individual swaras on the virtual keyboard to hear and internalize the exact intervals of a scale.', btnText: 'Open Swara Keyboard' },
                        { n: 4, name: 'Ear Training',    tab: 'singback', desc: 'Phrase Reproduction',         longDesc: 'Listen to a phrase and reproduce it by ear. Aim for 80 %+ to sharpen pitch memory and muscle memory together.', btnText: 'Launch Sing-Back' },
                    ];
                    const doneCount = sadhana.completed.length;
                    const pct = Math.round((doneCount / steps.length) * 100);
                    return (
                    <div className="w-full max-w-3xl p-4 md:p-8 flex flex-col items-center animate-fade-in mx-auto">
                        <div className="w-full flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-c-card border border-c-gold/30 flex items-center justify-center text-c-gold shadow-md flex-shrink-0">
                                <SadhanaIcon className="w-7 h-7" />
                            </div>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h2 className="font-playfair text-2xl font-bold tracking-wider text-c-gold uppercase leading-none">Daily Sadhana</h2>
                                    <span className="text-[8px] uppercase tracking-widest bg-c-gold/15 text-c-gold px-2 py-0.5 rounded font-semibold border border-c-gold/20 leading-none">Daily Practice</span>
                                </div>
                                <p className="text-c-cream-dim text-[11px] mt-1 font-light leading-relaxed">
                                    A daily sequence to build pitch, scale accuracy, and raga memory. Resets each morning.
                                </p>
                            </div>
                        </div>
                        <SketchyRule className="mt-2 mb-2 opacity-60" />

                        {/* Progress card */}
                        <div className="w-full border border-c-border bg-c-card rounded-xl p-5 relative overflow-hidden mb-6 tour-sadhana-console">
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="heritage-border-corner heritage-corner-tl" />
                                <div className="heritage-border-corner heritage-corner-tr" />
                                <div className="heritage-border-corner heritage-corner-bl" />
                                <div className="heritage-border-corner heritage-corner-br" />
                            </div>
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-c-border/50 pb-4 mb-4 relative z-10">
                                <div>
                                    <span className="text-[9px] uppercase tracking-widest text-c-gold font-mono">Today's Progress</span>
                                    <h3 className="font-playfair text-lg font-bold text-c-cream mt-0.5">{doneCount} of {steps.length} steps done</h3>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-1.5 border border-c-border rounded-full bg-c-surface">
                                    <span className="text-xs text-c-cream font-mono flex items-center gap-1">Streak: <strong className="flex items-center gap-0.5"><FireIcon className="w-3.5 h-3.5 text-orange-500" /> {sadhana.streak} {sadhana.streak === 1 ? 'day' : 'days'}</strong></span>
                                </div>
                            </div>
                            <div className="space-y-1.5 relative z-10">
                                <div className="flex justify-between text-xs font-mono text-c-cream-dim">
                                    <span>Daily target</span>
                                    <span className="text-c-gold font-bold">{pct}%</span>
                                </div>
                                <div className="w-full h-2.5 bg-c-surface border border-c-border/50 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-c-gold-dim to-c-gold rounded-full transition-all duration-700"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                {doneCount === steps.length && (
                                    <p className="text-[11px] text-emerald-700 font-playfair italic text-center pt-1">
                                        ✦ Today's sadhana complete — well done!
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Steps grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            {steps.map((item) => {
                                const done = sadhana.completed.includes(item.tab);
                                return (
                                <div
                                    key={item.n}
                                    className={`border rounded-xl p-5 flex flex-col justify-between transition-all duration-300 ${
                                        done
                                            ? 'border-emerald-600/30 bg-emerald-50/60'
                                            : 'border-c-border bg-c-surface hover:border-c-gold/50'
                                    }`}
                                >
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <span className="relative w-7 h-7 flex items-center justify-center flex-shrink-0">
                                                <svg viewBox="0 0 28 28" fill="none" className={`absolute inset-0 w-full h-full ${done ? 'text-emerald-600' : 'text-c-gold'}`}>
                                                    <path d="M14 2.5 C20.5 1.8, 26.2 7.5, 26.5 14 C26.8 20.5, 21 26.3, 14 26.5 C7 26.7, 1.7 21, 1.8 14 C1.9 7 7.5 3.2 14 2.5Z" stroke="currentColor" strokeWidth="1.4" fill="currentColor" style={{ fillOpacity: done ? 0.9 : 0.12 }}/>
                                                </svg>
                                                <span className={`relative z-10 text-[10px] font-mono font-bold ${done ? 'text-white' : 'text-c-gold'}`}>
                                                    {done ? '✓' : item.n}
                                                </span>
                                            </span>
                                            <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border ${
                                                done
                                                    ? 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700'
                                                    : 'border-c-gold/30 bg-c-gold/5 text-c-gold'
                                            }`}>
                                                {done ? '✓ Done' : 'Pending'}
                                            </span>
                                        </div>
                                        <div>
                                            <h4 className="font-playfair text-sm font-bold text-c-cream flex items-center gap-1.5">
                                                <span className="text-c-gold"><CuratedIcon icon={item.tab} className="w-5 h-5" /></span> {item.name}
                                            </h4>
                                            <span className="text-[10px] text-c-gold font-mono uppercase tracking-wider block mt-0.5">{item.desc}</span>
                                        </div>
                                        <p className="text-xs text-c-cream-dim leading-relaxed font-playfair">
                                            {item.longDesc}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => goTo(item.tab)}
                                        className={`w-full mt-4 py-2.5 rounded font-playfair font-bold text-xs tracking-wider uppercase transition-all active:scale-[0.98] cursor-pointer ${
                                            done
                                                ? 'bg-c-card border border-c-border text-c-cream-dim hover:bg-c-surface'
                                                : 'bg-c-gold text-c-bg hover:bg-c-gold-light'
                                        }`}
                                    >
                                        {done ? 'Practice again →' : `${item.btnText} →`}
                                    </button>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                    );
                })()}
            </div>

            {!(view === 'home' && !showFeatures) && (
                <footer className="py-6 text-center text-c-cream-dark text-xs font-playfair italic border-t border-c-border">
                    Ālāpana · Solo Practice for Carnatic Learners
                </footer>
            )}
        </div>

        {/* ── GORGEOUS GOLDEN SADHANA TOAST ── */}
        {sadhanaToast && (
            <>
                <style>{`
                    @keyframes sadhanaSlideUp {
                        0% { transform: translate(-50%, 30px); opacity: 0; }
                        100% { transform: translate(-50%, 0); opacity: 1; }
                    }
                `}</style>
                <div 
                    className="fixed bottom-24 left-1/2 z-[11000] max-w-sm w-[90%] pointer-events-none"
                    style={{
                        transform: 'translateX(-50%)',
                        animation: 'sadhanaSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    }}
                >
                    <div className="bg-[#1e0c04]/95 border-2 border-[#f7d686] rounded-xl shadow-[0_10px_35px_rgba(247,214,134,0.3),_0_0_20px_rgba(0,0,0,0.8)] p-4 flex items-center gap-3.5 relative overflow-hidden backdrop-blur-md">
                        {/* Heritage Corners */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="heritage-border-corner heritage-corner-tl opacity-65" />
                            <div className="heritage-border-corner heritage-corner-tr opacity-65" />
                            <div className="heritage-border-corner heritage-corner-bl opacity-65" />
                            <div className="heritage-border-corner heritage-corner-br opacity-65" />
                        </div>
                        
                        {/* Gold pulsing symbol */}
                        <div className="w-10 h-10 rounded-full bg-[#f7d686]/10 border border-[#f7d686]/30 flex items-center justify-center text-[#f7d686] text-xl font-bold flex-shrink-0 animate-pulse">
                            ✨
                        </div>

                        <div className="flex-1 min-w-0 z-10">
                            <div className="text-[9px] font-mono text-[#f7d686]/80 uppercase tracking-[0.2em] font-bold">
                                Sadhana {sadhanaToast.stepName} Done
                            </div>
                            <h4 className="font-playfair text-white text-xs font-bold mt-0.5 leading-tight tracking-wide">
                                {sadhanaToast.title}!
                            </h4>
                        </div>
                    </div>
                </div>
            </>
        )}

        {isSignedIn && view !== 'home' && (
            <CoachPanel
                userId={userId}
                getToken={getToken}
                onNavigate={(view) => goTo(view)}
                appMode={appMode}
                sadhanaState={sadhana}
            />
        )}
    </>
  );
}

export default App;
