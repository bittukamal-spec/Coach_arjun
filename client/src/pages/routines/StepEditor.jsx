import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { LIMITS } from './builderDraft';

// Ordered, editable routine steps for the Review screen. Every step —
// Arjun-suggested or the athlete's own habit — can be edited, moved and
// deleted; nothing is locked. Step kinds are never shown to the athlete.
export default function StepEditor({ steps, t, onEdit, onMove, onDelete, onAdd }) {
  const atMax = steps.length >= LIMITS.MAX_STEPS;
  return (
    <div>
      <ol className="flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={step.key} className="bg-dark-800 border border-dark-600 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-caption font-semibold text-slt uppercase tracking-wide">{t.stepLabel(i + 1)}</span>
              {step.origin === 'existing' && (
                <span className="text-caption text-brand-400">{t.youAlreadyDoThis}</span>
              )}
            </div>
            <textarea
              value={step.instruction}
              onChange={e => onEdit(step.key, e.target.value)}
              maxLength={LIMITS.INSTRUCTION}
              rows={2}
              aria-label={t.stepLabel(i + 1)}
              placeholder={t.stepPlaceholder}
              className="w-full bg-dark-700 border border-dark-500 text-ink rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slt resize-none"
            />
            <div className="flex items-center gap-1 mt-2">
              <button
                type="button"
                onClick={() => onMove(step.key, 'up')}
                disabled={i === 0}
                aria-label={`${t.moveUp}: ${t.stepLabel(i + 1)}`}
                className="w-11 h-11 flex items-center justify-center rounded-full text-slt hover:text-ink disabled:opacity-30"
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onMove(step.key, 'down')}
                disabled={i === steps.length - 1}
                aria-label={`${t.moveDown}: ${t.stepLabel(i + 1)}`}
                className="w-11 h-11 flex items-center justify-center rounded-full text-slt hover:text-ink disabled:opacity-30"
              >
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(step.key)}
                aria-label={`${t.deleteStep}: ${t.stepLabel(i + 1)}`}
                className="w-11 h-11 ml-auto flex items-center justify-center rounded-full text-red-400 hover:text-red-300"
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onAdd}
        disabled={atMax}
        className="mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 border-2 border-dashed border-dark-500 text-slt hover:text-ink rounded-2xl text-sm font-medium disabled:opacity-40"
      >
        <Plus size={16} aria-hidden="true" />
        {t.addStep}
      </button>
      <p className="text-caption text-slt mt-2 text-center">{t.maxSteps(LIMITS.MAX_STEPS)}</p>
    </div>
  );
}
