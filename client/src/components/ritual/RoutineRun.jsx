import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, PageHeader } from '../ui';

// Rehearsal walkthrough for one saved routine — one step per screen.
//
// Routines are used on the field, not on the phone; this exists so the
// athlete can rehearse the sequence beforehand until it is automatic
// (spec §3.2: a pre-performance routine is "rehearsed in training first").
// Entirely client-side: nothing is saved, timed, counted or scored.
export default function RoutineRun({ routine, title, color, t, onExit }) {
  const steps = Array.isArray(routine?.steps) ? routine.steps : [];
  const [index, setIndex] = useState(0);
  const finished = index >= steps.length;
  const step = finished ? null : steps[index];

  const back = () => (index === 0 ? onExit() : setIndex(i => i - 1));

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      <PageHeader onBack={back} title={title} />
      <main className="flex-1 max-w-lg w-full mx-auto px-page py-6 flex flex-col animate-fade-in">
        {!finished && (
          <>
            {/* Progress — one bar per step, no numbers to chase. */}
            <div className="flex gap-1.5 mb-8" aria-hidden="true">
              {steps.map((s, i) => (
                <span
                  key={s.id || i}
                  className="h-1.5 flex-1 rounded-full bg-dark-600"
                  style={i <= index ? { background: color } : undefined}
                />
              ))}
            </div>

            <div className="flex-1 flex flex-col justify-center text-center" aria-live="polite">
              <p className="text-caption font-bold uppercase mb-3" style={{ color }}>
                {t.runStepOf(index + 1, steps.length)}
              </p>
              <p className="text-display font-black text-ink leading-tight break-words">
                {step.instruction}
              </p>
              {step.cue && (
                <p className="text-title text-slt mt-4 break-words">“{step.cue}”</p>
              )}
              <p className="text-caption text-slt mt-8">{t.runHint}</p>
            </div>

            <Button type="button" onClick={() => setIndex(i => i + 1)} className="w-full mt-6">
              {index === steps.length - 1 ? t.runFinish : t.runNext}
            </Button>
          </>
        )}

        {finished && (
          <div className="flex-1 flex flex-col justify-center text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center text-white"
              style={{ background: color }}
              aria-hidden="true"
            >
              <Check size={30} />
            </div>
            <h2 className="text-title font-black text-ink mb-2">{t.runDoneTitle}</h2>
            <p className="text-body text-slt leading-relaxed mb-8">{t.runDoneBody}</p>
            <div className="flex flex-col gap-3">
              <Button type="button" onClick={onExit} className="w-full">{t.runDone}</Button>
              <Button type="button" variant="outline" onClick={() => setIndex(0)} className="w-full">
                {t.runAgain}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
