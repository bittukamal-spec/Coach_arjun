import { useLayoutEffect, useRef } from 'react';

// Step-by-step flows (Pressure Reset, Quick Rep, Ritual views, …) change
// screens without changing the URL. When the step changes, start the new
// screen at the top — like opening a new page. The first render is skipped so
// ScrollManager can still return the athlete to where they were on Back.
export default function useScrollTopOnChange(value) {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
  }, [value]);
}
