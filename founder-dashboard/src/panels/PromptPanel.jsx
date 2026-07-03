import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const TYPES = [
  { id: 'feature', label: 'New Feature' },
  { id: 'fix',     label: 'Bug Fix'     },
  { id: 'route',   label: 'New Route'   },
  { id: 'audit',   label: 'Audit'       },
];

function buildPrompt({ type, targetFile, description, constraints }) {
  const c = constraints ? `\n\nConstraints: ${constraints}` : '';
  switch (type) {
    case 'feature':
      return `Build the following feature: ${description || '[description]'}.\n\nFiles to create/modify: ${targetFile || '[file path]'}.\n\nFollow CLAUDE.md §14 coding patterns. Add all UI strings to translations.js in both EN + HI. Use PrismaClient per route file pattern. No new npm packages without explicit approval.${c}\n\nBuild check: cd client && npm run build — must pass with zero errors before reporting done.`;
    case 'fix':
      return `Fix the following bug: ${description || '[description]'}.\n\nLocation: ${targetFile || '[file:line]'}.\n\nDo not modify files outside the scope of this fix. Do not add error handling for scenarios that cannot happen. Do not refactor surrounding code.${c}\n\nBuild check: cd client && npm run build — must pass with zero errors before reporting done.`;
    case 'route':
      return `Add a new API route: ${targetFile || '[METHOD /api/path]'}.\n\n${description || '[description]'}\n\nPatterns to follow:\n- Register in server/src/index.js\n- Use authenticate middleware + new PrismaClient() per route file\n- No new npm packages in the main server\n- Export router with module.exports = router${c}`;
    case 'audit':
      return `Audit the following area: ${targetFile || '[file or area]'}.\n\nFocus: ${description || '[what to check]'}\n\nReport format:\n- Finding with file:line reference\n- Severity: RED / AMBER / GREEN\n- Recommended fix\n\nUse PLAN MODE (EnterPlanMode) before making any edits. Write findings to AUDIT.md if it exists.${c}`;
    default:
      return '';
  }
}

export default function PromptPanel() {
  const [type,        setType]        = useState('feature');
  const [targetFile,  setTargetFile]  = useState('');
  const [description, setDescription] = useState('');
  const [constraints, setConstraints] = useState('');
  const [copied,      setCopied]      = useState(false);

  const prompt = buildPrompt({ type, targetFile, description, constraints });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the textarea
    }
  };

  const labelClass = 'block text-xs font-medium text-[#94A3B8] mb-1.5 uppercase tracking-wide';
  const inputClass = 'w-full bg-[#0F172A] border border-[#334155] rounded-lg px-3 py-2.5 text-sm text-[#F1F5F9] placeholder-[#475569] focus:outline-none focus:border-[#1769AA]';

  return (
    <div className="flex-1 overflow-y-auto pb-24 px-4 pt-5 space-y-5">
      <h1 className="text-lg font-bold text-[#F1F5F9]">Prompt Builder</h1>

      {/* Task type */}
      <div>
        <label className={labelClass}>Task type</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className="py-2.5 px-3 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: type === t.id ? '#1769AA' : '#1E293B',
                color: type === t.id ? '#fff' : '#94A3B8',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target file / path */}
      <div>
        <label className={labelClass}>
          {type === 'route' ? 'Route (e.g. POST /api/foo)' : 'File / location'}
        </label>
        <input
          type="text"
          className={inputClass}
          placeholder={type === 'route' ? 'POST /api/example' : 'server/src/routes/example.js:42'}
          value={targetFile}
          onChange={e => setTargetFile(e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          rows={4}
          className={inputClass + ' resize-none'}
          placeholder="What needs to happen? Be specific — file paths, field names, exact behaviour."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Constraints */}
      <div>
        <label className={labelClass}>Constraints (optional)</label>
        <input
          type="text"
          className={inputClass}
          placeholder="e.g. Do not modify TrainPage.jsx. No new DB migrations."
          value={constraints}
          onChange={e => setConstraints(e.target.value)}
        />
      </div>

      {/* Generated prompt */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={labelClass}>Generated prompt</label>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: copied ? '#166534' : '#1769AA', color: '#fff' }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <textarea
          readOnly
          rows={10}
          className={inputClass + ' resize-none text-[#CBD5E1] font-mono text-xs leading-relaxed'}
          value={prompt}
        />
      </div>
    </div>
  );
}
