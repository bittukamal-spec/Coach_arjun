import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

// Shared frame for the small public help screens (forgot / reset password):
// page colour, a back button, centred content up to 420px, theme tokens.
// `tone="mint"` gives the calm "done" screens their mint page.
export function HelpPageShell({ backTo = '/auth?tab=signin', backLabel, tone, children }) {
  const navigate = useNavigate();
  return (
    <div className={`flex min-h-screen flex-col text-ink ${tone === 'mint' ? 'bg-[#DDF7EE] text-inkblock' : 'bg-dark-900'}`}>
      <header className="mx-auto flex h-14 w-full max-w-[420px] items-center px-5">
        {backTo && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
            className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-dark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}
      </header>
      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-5 pb-10">{children}</main>
    </div>
  );
}

export const HELP_INPUT = 'w-full min-h-[48px] rounded-[14px] bg-dark-400 px-3.5 text-[15px] text-ink placeholder:text-slt focus:outline-none focus:ring-2 focus:ring-brand-500';
export const HELP_LABEL = 'mb-1.5 block text-[13px] text-slt';
export const HELP_MAIN_BTN = 'flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-sun text-[15px] font-bold text-inkblock disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
export const HELP_LINK = 'mx-auto mt-3 flex min-h-[44px] items-center rounded-lg px-2 text-[14px] text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
export const HELP_ERROR = 'rounded-xl bg-[#FDF3F2] px-3 py-2.5 text-[13px] text-[#B4443C]';
