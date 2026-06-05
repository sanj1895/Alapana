import { RAGAS } from '../utils/ragaLogic';

function fmt(note) {
  return note.replace(/([a-zA-Z]+)([123])/, (_, name, n) => {
    const subs = { '1': '₁', '2': '₂', '3': '₃' };
    return name + subs[n];
  });
}

function diffNotes(aArr, bArr) {
  const aSet = new Set(aArr.filter(n => n !== 'Sa'));
  const bSet = new Set(bArr.filter(n => n !== 'Sa'));
  const diff = new Set();
  for (const n of aSet) if (!bSet.has(n)) diff.add(n);
  for (const n of bSet) if (!aSet.has(n)) diff.add(n);
  return diff;
}

function ScaleRow({ notes, diffSet }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {notes.map((note, i) => {
        const isDiff = diffSet.has(note);
        return (
          <span
            key={i}
            className={`px-2.5 py-1 rounded-full text-[11px] font-mono tracking-wide border ${
              isDiff
                ? 'bg-c-gold/12 border-c-gold/55 text-c-gold font-bold'
                : 'bg-c-surface border-c-border/50 text-c-cream-dark'
            }`}
          >
            {fmt(note)}
          </span>
        );
      })}
    </div>
  );
}

function RagaCard({ name, raga, diffSet }) {
  if (!raga) {
    return (
      <div className="flex-1 rounded-[16px] border border-c-border bg-c-card px-5 py-5">
        <p className="font-playfair text-c-cream-dark text-sm">{name} — not in library</p>
      </div>
    );
  }
  return (
    <div className="flex-1 rounded-[16px] border border-c-border bg-c-card px-5 py-5">
      <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold font-mono mb-1">{raga.type}</p>
      <h3 className="font-playfair text-c-cream-dim text-[1.35rem] font-bold leading-tight mb-1">{name}</h3>
      {raga.mood && (
        <p className="text-[11px] text-c-cream-dark font-playfair italic mb-4">{raga.mood}</p>
      )}

      <div className="mb-3">
        <p className="text-[8px] uppercase tracking-[0.22em] text-c-cream-dark font-mono mb-1">Arohanam ↑</p>
        <ScaleRow notes={raga.arohanam} diffSet={diffSet} />
      </div>
      <div>
        <p className="text-[8px] uppercase tracking-[0.22em] text-c-cream-dark font-mono mb-1">Avarohanam ↓</p>
        <ScaleRow notes={raga.avarohanam} diffSet={diffSet} />
      </div>

      {raga.description && (
        <p className="mt-4 text-[11.5px] font-playfair text-c-cream-dark leading-relaxed border-t border-c-border/40 pt-3">
          {raga.description}
        </p>
      )}

      {raga.importantNotes?.length > 0 && (
        <div className="mt-3">
          <p className="text-[8px] uppercase tracking-[0.22em] text-c-cream-dark font-mono mb-1.5">Characteristic notes</p>
          <div className="flex flex-wrap gap-1">
            {raga.importantNotes.map((n, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-c-gold/10 border border-c-gold/35 text-c-gold">
                {fmt(n)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RagaCompare({ ragaA, ragaB, onBack, onPractice }) {
  const dataA = RAGAS[ragaA];
  const dataB = RAGAS[ragaB];

  const diffSet = (dataA && dataB)
    ? diffNotes(
        [...(dataA.arohanam || []), ...(dataA.avarohanam || [])],
        [...(dataB.arohanam || []), ...(dataB.avarohanam || [])]
      )
    : new Set();

  const diffList = [...diffSet].filter(n => n !== 'Sa');

  return (
    <main className="w-full max-w-3xl mx-auto flex flex-col gap-5 px-4 md:px-8 py-8 animate-fade-in">

      {/* Back */}
      <button
        onClick={onBack}
        className="self-start text-[10px] font-mono uppercase tracking-widest text-c-cream-dark hover:text-c-cream-dim transition-colors flex items-center gap-1.5"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 2L4 6l4 4"/>
        </svg>
        Back
      </button>

      {/* Title */}
      <div>
        <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold font-mono mb-1">Raga comparison</p>
        <h2 className="font-playfair text-c-cream-dim text-[1.5rem] font-bold leading-tight">
          {ragaA} <span className="text-c-cream-dark font-normal mx-1">vs</span> {ragaB}
        </h2>
      </div>

      {/* Distinguishing notes */}
      {diffList.length > 0 && (
        <div className="rounded-[14px] border border-c-gold/30 bg-c-card px-4 py-4">
          <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold font-mono mb-1.5">The distinguishing notes</p>
          <p className="text-[0.82rem] font-playfair text-c-cream-dark leading-relaxed mb-3">
            These are the only notes that differ between the two ragas. Drilling these is how you stop confusing them.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {diffList.map((n, i) => (
              <span key={i} className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-c-gold/12 border border-c-gold/55 text-c-gold">
                {fmt(n)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Side by side */}
      <div className="flex flex-col sm:flex-row gap-3">
        <RagaCard name={ragaA} raga={dataA} diffSet={diffSet} />
        <RagaCard name={ragaB} raga={dataB} diffSet={diffSet} />
      </div>

      {/* Next step */}
      <div className="rounded-[14px] border border-c-border bg-c-card px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] text-c-gold font-mono mb-1">Next step</p>
          <p className="text-[0.82rem] font-playfair text-c-cream-dark leading-relaxed">
            Sing the arohanam of each raga back to back, holding the highlighted notes. Open Gurukul to practice with a drone and AI pitch feedback.
          </p>
        </div>
        <button
          onClick={onPractice}
          className="flex-shrink-0 text-[10px] font-mono uppercase tracking-widest px-4 py-2 rounded-lg bg-c-gold text-c-bg font-bold hover:bg-c-gold-light transition-all whitespace-nowrap"
        >
          Open Gurukul →
        </button>
      </div>

    </main>
  );
}
