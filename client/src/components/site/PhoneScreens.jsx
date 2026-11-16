import { ArjunLogo } from '../ArjunLogo';

// Flat drawings of the real Arjun app, shown inside a phone on the public
// website (hero + "How Arjun helps"). They are pictures, not live UI: the
// colours are the light-theme Playbook colours so the phone looks the same
// whichever theme the visitor's device uses.

export function PhoneFrame({ children, className = '' }) {
  return (
    <div className={`relative w-[268px] h-[560px] rounded-[44px] bg-[#101533] p-[10px] shadow-[0_24px_50px_rgba(16,21,51,0.22)] ${className}`}>
      <div className="h-full w-full overflow-hidden rounded-[36px] text-[#101533]">{children}</div>
    </div>
  );
}

function Notch() {
  return (
    <div className="flex h-[26px] items-center justify-center" aria-hidden="true">
      <span className="h-[18px] w-20 rounded-[10px] bg-[#101533]" />
    </div>
  );
}

function Bubble({ from, children }) {
  return from === 'you'
    ? <span className="self-end max-w-[80%] rounded-[16px_16px_4px_16px] bg-[#1B4DFF] px-[11px] py-[9px] text-[12px] leading-[1.4] text-white">{children}</span>
    : <span className="self-start max-w-[85%] rounded-[16px_16px_16px_4px] bg-white px-[11px] py-[9px] text-[12px] leading-[1.4]">{children}</span>;
}

// Coach chat. `card` adds the yellow practice card Arjun suggests.
export function ChatScreen({ t, msgs, card }) {
  return (
    <div className="flex h-full flex-col bg-[#EEF3FF]">
      <Notch />
      <div className="flex items-center gap-2 px-3.5 py-2">
        <ArjunLogo size={22} />
        <span className="flex flex-col">
          <span className="text-[13px] font-bold">{t.name}</span>
          <span className="text-[9.5px] text-[#4A5273]">{t.sub}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-[9px] px-3 py-2.5">
        {msgs.map((m, i) => <Bubble key={i} from={m.from}>{m.text}</Bubble>)}
        {card && (
          <span className="flex w-[85%] flex-col gap-1.5 self-start rounded-2xl bg-[#FFC629] px-[11px] py-2.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.08em]">{card.tag}</span>
            <span className="text-[13px] font-bold">{card.title}</span>
            <span className="self-start rounded-[10px] bg-[#101533] px-3 py-1.5 text-[11px] font-bold text-white">{card.cta}</span>
          </span>
        )}
      </div>
      <div className="mx-2.5 mb-3 flex h-[38px] items-center rounded-[19px] bg-white px-3 text-[11px] text-[#4A5273]">{t.input}</div>
    </div>
  );
}

export function BreatheScreen({ t }) {
  return (
    <div className="flex h-full flex-col items-center bg-[#7FE3C4]">
      <Notch />
      <span className="mt-[22px] text-[11px] font-bold uppercase tracking-[0.1em]">{t.round}</span>
      <svg aria-hidden="true" width="200" height="200" viewBox="0 0 200 200" className="mt-[26px]">
        <circle cx="100" cy="100" r="96" fill="#A8EFD8" />
        <circle cx="100" cy="100" r="70" fill="#D2F8EA" />
        <circle cx="100" cy="100" r="44" fill="#FFFFFF" />
        <circle cx="100" cy="100" r="12" fill="#101533" />
      </svg>
      <span className="mt-[26px] text-[22px] font-extrabold">{t.action}</span>
      <span className="mt-1 text-[40px] font-extrabold leading-none">{t.count}</span>
      <span className="mb-[18px] mt-auto text-[11px] text-[#1C3B33]">{t.hint}</span>
    </div>
  );
}

export function WeekScreen({ t }) {
  const days = [1, 1, 0, 1, 1, 0, 1];
  return (
    <div className="flex h-full flex-col bg-[#EEF3FF] px-3">
      <Notch />
      <span className="mt-3 text-[10px] text-[#4A5273]">{t.day}</span>
      <span className="text-[20px] font-extrabold">{t.greeting}</span>
      <div className="mt-3 flex flex-col gap-2 rounded-[18px] bg-white p-3">
        <span className="text-[11px] font-bold">{t.title}</span>
        <span className="grid grid-cols-3 gap-1">
          <span className="flex flex-col"><span className="text-[20px] font-extrabold">5</span><span className="text-[9px] text-[#4A5273]">{t.practicesLabel}</span></span>
          <span className="flex flex-col"><span className="text-[20px] font-extrabold">2</span><span className="text-[9px] text-[#4A5273]">{t.journalLabel}</span></span>
          <span className="flex flex-col"><span className="text-[20px] font-extrabold">{t.helpedValue}</span><span className="text-[9px] text-[#4A5273]">{t.helped}</span></span>
        </span>
        <span className="grid grid-cols-7 gap-1" aria-hidden="true">
          {days.map((d, i) => <span key={i} className={`h-1.5 rounded-full ${d ? 'bg-[#1B4DFF]' : 'bg-[#D5DDF5]'}`} />)}
        </span>
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5 rounded-[18px] bg-[#1B4DFF] p-3 text-white">
        <span className="self-start rounded-full bg-white px-[7px] py-[3px] text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#1B3FD1]">{t.fromArjun}</span>
        <span className="text-[14px] font-extrabold">{t.practice}</span>
        <span className="text-[10px] text-[#E3EAFF]">{t.practiceSub}</span>
        <span className="flex h-[30px] items-center justify-center rounded-[10px] bg-[#FFC629] text-[11px] font-extrabold text-[#101533]">{t.start}</span>
      </div>
      <div className="mt-2.5 rounded-[18px] bg-[#FFC629] p-3 text-[13px] font-extrabold">{t.talk}</div>
      <div className="mt-2.5 rounded-[18px] bg-[#FF8AD4] p-3 text-[13px] font-extrabold">{t.journalRow}</div>
    </div>
  );
}
