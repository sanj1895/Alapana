import React, { useState, useEffect, useCallback } from 'react';
import { CURRICULUM, COURSES } from '../utils/tutorCurriculum';
import { GurukulIcon } from './tutor/shared';
import LessonRunner, { ExerciseShrutiSetup } from './tutor/LessonRunner';
import { TalaSwaraTranscriber, RagaPractice } from './tutor/PracticePanels';
import { ProgramsCatalog, CurriculumHome, UnitView } from './tutor/CurriculumBrowser';

export default function Tutor({ saFrequency, appMode = 'musician', onSadhanaComplete, transcribeOnly = false, launchTarget = null, onNavigationChange, onLaunchHandled }) {
    const [sa, setSa] = useState(() => {
        try {
            return Number(localStorage.getItem('tutor_base_sa') || saFrequency || 261.63);
        } catch {
            return saFrequency || 261.63;
        }
    });
    const [tunerOpen, setTunerOpen] = useState(false);
    const [tab, setTab] = useState(appMode === 'musician' ? 'practice' : 'curriculum');
    const [screen, setScreen] = useState('home');
    const [activeUnit, setActiveUnit] = useState(null);
    const [activeLesson, setActiveLesson] = useState(null);
    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [progress, setProgress] = useState(() => {
        try { return JSON.parse(localStorage.getItem('tutor_progress_v2') || '{}'); } catch { return {}; }
    });
    const [structuredMode, setStructuredMode] = useState(() => {
        try { return localStorage.getItem('tutor_structured_mode') === 'true'; } catch { return false; }
    });

    const toggleStructuredMode = () => {
        setStructuredMode((prev) => {
            const next = !prev;
            try { localStorage.setItem('tutor_structured_mode', String(next)); } catch {}
            return next;
        });
    };

    const updateSa = (newSa) => {
        setSa(newSa);
        try { localStorage.setItem('tutor_base_sa', String(newSa)); } catch {}
    };

    const getWesternNoteName = (freq) => {
        if (!freq || freq <= 0) return 'Unknown';
        const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const midi = Math.round(69 + 12 * Math.log2(freq / 440));
        const noteName = NOTES[((midi % 12) + 12) % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${noteName}${octave}`;
    };

    const saveProgress = (unitId, lessonId) => {
        const next = { ...progress, [`${unitId}/${lessonId}`]: true };
        setProgress(next);
        localStorage.setItem('tutor_progress_v2', JSON.stringify(next));
    };

    const resetProgress = () => {
        if (window.confirm('Are you sure you want to reset your entire progress?')) {
            setProgress({});
            localStorage.setItem('tutor_progress_v2', '{}');
        }
    };

    const activeCourse = COURSES.find((course) => course.id === selectedCourseId);
    const activeCurriculum = activeCourse?.curriculum || CURRICULUM;
    const tutorTabs = appMode === 'musician'
        ? ['practice', 'transcribe', 'curriculum']
        : ['curriculum', 'practice', 'transcribe'];
    const syncTutorRoute = useCallback((target = null, options = {}) => {
        onNavigationChange?.(target, options);
    }, [onNavigationChange]);

    const nextLesson = activeUnit && activeLesson
        ? (() => {
            const unitIdx = activeCurriculum.findIndex((unit) => unit.id === activeUnit.id);
            if (unitIdx === -1) return null;
            const lessonIdx = activeCurriculum[unitIdx].lessons.findIndex((lesson) => lesson.id === activeLesson.id);
            if (lessonIdx === -1) return null;
            const followingLesson = activeCurriculum[unitIdx].lessons[lessonIdx + 1];
            if (followingLesson) return { unit: activeCurriculum[unitIdx], lesson: followingLesson };
            const followingUnit = activeCurriculum[unitIdx + 1];
            if (!followingUnit?.lessons?.length) return null;
            return { unit: followingUnit, lesson: followingUnit.lessons[0] };
        })()
        : null;

    useEffect(() => {
        if (transcribeOnly) return;

        if (launchTarget?.tab && launchTarget.tab !== tab) {
            setTab(launchTarget.tab);
        }

        if (!launchTarget?.courseId) {
            setTab(launchTarget?.tab || 'curriculum');
            setSelectedCourseId(null);
            setActiveUnit(null);
            setActiveLesson(null);
            setScreen('home');
            onLaunchHandled?.();
            return;
        }

        const course = COURSES.find((entry) => entry.id === launchTarget.courseId);
        if (!course) {
            onLaunchHandled?.();
            return;
        }

        const curriculum = course.curriculum || [];
        const unit = launchTarget.unitId ? curriculum.find((entry) => entry.id === launchTarget.unitId) : null;
        const lesson = launchTarget.lessonId && unit
            ? unit.lessons.find((entry) => entry.id === launchTarget.lessonId)
            : null;

        setTab(launchTarget.tab || 'curriculum');
        setSelectedCourseId(course.id);

        if (!launchTarget.unitId) {
            setActiveUnit(null);
            setActiveLesson(null);
            setScreen('home');
            onLaunchHandled?.();
            return;
        }

        if (!unit) {
            onLaunchHandled?.();
            return;
        }

        setActiveUnit(unit);
        if (!launchTarget.lessonId) {
            setActiveLesson(null);
            setScreen('unit');
            onLaunchHandled?.();
            return;
        }

        if (!lesson) {
            onLaunchHandled?.();
            return;
        }

        setActiveLesson(lesson);
        setScreen('lesson');
        onLaunchHandled?.();
    }, [launchTarget, onLaunchHandled, tab, transcribeOnly]);

    useEffect(() => {
        if (transcribeOnly || launchTarget?.tab) return;
        setTab(appMode === 'musician' ? 'practice' : 'curriculum');
    }, [appMode, launchTarget, transcribeOnly]);

    const isUnlocked = (unitIdx) => {
        if (!structuredMode || unitIdx === 0) return true;
        const prev = activeCurriculum[unitIdx - 1];
        return prev.lessons.every((lesson) => progress[`${prev.id}/${lesson.id}`]);
    };

    if (transcribeOnly) {
        return (
            <div className="w-full px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8 flex flex-col items-center gap-4 sm:gap-6 animate-fade-in">
                <div className="w-full max-w-4xl flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-3 border-b border-c-gold/20">
                        <div>
                            <h2 className="font-playfair text-2xl sm:text-3xl font-bold text-c-gold tracking-tight uppercase">Sangati Transcribe</h2>
                            <p className="text-c-cream-dark text-xs font-playfair opacity-85">Capture your own kriti variations against tala and convert them to notation.</p>
                        </div>
                        <div className="text-[10px] text-c-cream-dark font-mono">Sa: {sa.toFixed(2)} Hz</div>
                    </div>
                    <TalaSwaraTranscriber sa={sa} setSa={updateSa} />
                </div>
            </div>
        );
    }

    return (
        <div id="tour-tutor-container" className="w-full px-3 sm:px-4 md:px-8 py-4 sm:py-6 md:py-8 flex flex-col items-center gap-4 sm:gap-6 animate-fade-in">
            {screen === 'home' && (
                <>
                    <div className="w-full max-w-4xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-c-gold/20 animate-fade-in">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="flex-shrink-0 text-c-gold opacity-90">
                                <GurukulIcon className="w-12 h-12 md:w-14 md:h-14" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h2 className="font-playfair text-2xl sm:text-3xl md:text-4xl font-bold text-c-gold tracking-tight uppercase">Svara Gurukul</h2>
                                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-c-gold/15 border border-c-gold/30 text-c-gold self-center shadow-sm">
                                        {appMode === 'musician' ? 'Studio' : 'Academy'}
                                    </span>
                                </div>
                                <p className="text-c-cream-dark text-xs leading-relaxed font-playfair opacity-80">
                                    {appMode === 'musician'
                                        ? 'A flexible Carnatic workspace for repertoire, notation, ear training, and raga practice.'
                                        : 'A guided path from shruti and swaras to confident, independent singing.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2.5 bg-c-surface border border-c-border/60 rounded-xl px-3.5 py-2.5 relative overflow-hidden heritage-card self-start sm:self-auto">
                            <div className="heritage-border-corner heritage-corner-tl" style={{ top: 2, left: 2 }} />
                            <div className="heritage-border-corner heritage-corner-tr" style={{ top: 2, right: 2 }} />
                            <div className="heritage-border-corner heritage-corner-bl" style={{ bottom: 2, left: 2 }} />
                            <div className="heritage-border-corner heritage-corner-br" style={{ bottom: 2, right: 2 }} />
                            <svg className="w-4 h-4 text-c-gold flex-shrink-0 z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18V5l12-2v13" />
                                <circle cx="6" cy="18" r="3" />
                                <circle cx="18" cy="16" r="3" />
                            </svg>
                            <div className="z-10">
                                <div className="text-[8px] text-c-cream-dark uppercase tracking-widest font-mono font-extrabold">Base Sa</div>
                                <div className="text-sm font-playfair font-black text-c-gold leading-none">
                                    {getWesternNoteName(sa)} <span className="font-sans text-[10px] font-normal text-c-cream-dim">({sa} Hz)</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setTunerOpen(!tunerOpen)}
                                className="z-10 px-3 py-1.5 text-[10px] border border-c-gold/40 text-c-gold rounded-full hover:bg-c-gold hover:text-c-bg font-playfair font-bold transition-all flex items-center gap-1.5 flex-shrink-0"
                            >
                                {tunerOpen ? 'Close' : (
                                    <>
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="4" y1="6" x2="20" y2="6" />
                                            <line x1="4" y1="12" x2="14" y2="12" />
                                            <line x1="4" y1="18" x2="20" y2="18" />
                                            <circle cx="17" cy="6" r="3" />
                                            <circle cx="17" cy="18" r="3" />
                                        </svg>
                                        Tune
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {tunerOpen && (
                        <div className="w-full max-w-4xl border border-c-border/40 rounded-xl p-4 bg-c-surface animate-fade-in flex justify-center">
                            <ExerciseShrutiSetup
                                sa={sa}
                                setSa={updateSa}
                                onDone={() => setTunerOpen(false)}
                                instruction="Set your base pitch using the calibrator below."
                            />
                        </div>
                    )}

                    <div className="w-full max-w-4xl">
                        <div className="flex gap-1 border-b border-c-border mb-6">
                            {[
                                {
                                    id: 'curriculum',
                                    label: 'Curriculum',
                                    icon: (
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                        </svg>
                                    ),
                                },
                                {
                                    id: 'practice',
                                    label: 'Raga Practice',
                                    icon: (
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 12 C5 6, 9 6, 12 12 S19 18, 22 12" />
                                        </svg>
                                    ),
                                },
                                {
                                    id: 'transcribe',
                                    label: 'Transcribe',
                                    icon: (
                                        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 6h16M4 12h16M4 18h10" />
                                            <path d="M17 16l2 2 4-4" />
                                        </svg>
                                    ),
                                },
                            ].filter(({ id }) => tutorTabs.includes(id)).sort((a, b) => tutorTabs.indexOf(a.id) - tutorTabs.indexOf(b.id)).map(({ id, label, icon }) => (
                                <button
                                    key={id}
                                    onClick={() => {
                                        setTab(id);
                                        syncTutorRoute(id === 'curriculum'
                                            ? {
                                                tab: 'curriculum',
                                                courseId: selectedCourseId || undefined,
                                                unitId: screen !== 'home' ? activeUnit?.id : undefined,
                                                lessonId: screen === 'lesson' ? activeLesson?.id : undefined,
                                            }
                                            : { tab: id });
                                    }}
                                    className={`px-2 sm:px-5 py-2 text-xs font-playfair tracking-wide transition-colors relative flex items-center gap-1 sm:gap-1.5 ${
                                        tab === id ? 'text-c-gold' : 'text-c-cream-dim hover:text-c-cream'
                                    }`}
                                >
                                    {icon}
                                    {label}
                                    {tab === id && <span className="absolute left-0 right-0 -bottom-px h-px bg-c-gold" />}
                                </button>
                            ))}
                        </div>

                        {tab === 'curriculum' ? (
                            selectedCourseId === null ? (
                                <ProgramsCatalog
                                    appMode={appMode}
                                    progress={progress}
                                    onSelectCourse={(courseId) => {
                                        setSelectedCourseId(courseId);
                                        setActiveUnit(null);
                                        setActiveLesson(null);
                                        setScreen('home');
                                        syncTutorRoute({ tab: 'curriculum', courseId });
                                    }}
                                />
                            ) : (
                                <CurriculumHome
                                    progress={progress}
                                    isUnlocked={isUnlocked}
                                    onSelectUnit={(unit) => {
                                        setActiveUnit(unit);
                                        setActiveLesson(null);
                                        setScreen('unit');
                                        syncTutorRoute({ tab: 'curriculum', courseId: selectedCourseId, unitId: unit.id });
                                    }}
                                    onReset={resetProgress}
                                    onBackToCatalog={() => {
                                        setSelectedCourseId(null);
                                        setActiveUnit(null);
                                        setActiveLesson(null);
                                        setScreen('home');
                                        syncTutorRoute({ tab: 'curriculum' });
                                    }}
                                    activeCurriculum={activeCurriculum}
                                    structuredMode={structuredMode}
                                    onToggleStructuredMode={toggleStructuredMode}
                                />
                            )
                        ) : tab === 'practice' ? (
                            <RagaPractice sa={sa} initialRaga={launchTarget?.raga || null} />
                        ) : (
                            <TalaSwaraTranscriber sa={sa} setSa={updateSa} />
                        )}
                    </div>
                </>
            )}

            {screen === 'unit' && (
                <UnitView
                    unit={activeUnit}
                    progress={progress}
                    onSelectLesson={(lesson) => {
                        setActiveLesson(lesson);
                        setScreen('lesson');
                        syncTutorRoute({ tab: 'curriculum', courseId: selectedCourseId, unitId: activeUnit.id, lessonId: lesson.id });
                    }}
                    onBack={() => {
                        setActiveLesson(null);
                        setScreen('home');
                        syncTutorRoute({ tab: 'curriculum', courseId: selectedCourseId });
                    }}
                    structuredMode={structuredMode}
                />
            )}

            {screen === 'lesson' && (
                <LessonRunner
                    lesson={activeLesson}
                    sa={sa}
                    setSa={updateSa}
                    onComplete={() => {
                        saveProgress(activeUnit.id, activeLesson.id);
                        setActiveLesson(null);
                        setScreen('unit');
                        syncTutorRoute({ tab: 'curriculum', courseId: selectedCourseId, unitId: activeUnit.id });
                    }}
                    onBack={() => {
                        setActiveLesson(null);
                        setScreen('unit');
                        syncTutorRoute({ tab: 'curriculum', courseId: selectedCourseId, unitId: activeUnit.id });
                    }}
                    onSadhanaComplete={onSadhanaComplete}
                    nextLesson={nextLesson?.lesson || null}
                    onNextLesson={nextLesson ? (() => {
                        saveProgress(activeUnit.id, activeLesson.id);
                        setActiveUnit(nextLesson.unit);
                        setActiveLesson(nextLesson.lesson);
                        setScreen('lesson');
                        syncTutorRoute({
                            tab: 'curriculum',
                            courseId: selectedCourseId,
                            unitId: nextLesson.unit.id,
                            lessonId: nextLesson.lesson.id,
                        });
                    }) : null}
                />
            )}
        </div>
    );
}
