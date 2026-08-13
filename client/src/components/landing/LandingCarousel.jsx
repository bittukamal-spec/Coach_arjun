import { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Horizontal swipe carousel for the public homepage.
//
// Scroll-snap does the work on touch; everything else exists so the same
// content is reachable without a touchscreen:
//   - the track is a focusable region, so it scrolls with the arrow keys
//     natively, and ArrowLeft/ArrowRight are also handled explicitly so a
//     press always advances a whole card rather than a few pixels;
//   - prev/next buttons appear from `sm` up (a pointer context), 44px each,
//     disabled at the ends;
//   - the dots are real buttons at every width, so keyboard and screen-reader
//     users get direct access to each card, not just sequential scrolling.
//
// Nothing auto-rotates and no card content depends on motion: with
// prefers-reduced-motion the same scroll happens instantly.
function LandingCarousel({
  label,
  slideLabel = (i, n) => `${i + 1} of ${n}`,
  slideClass = '',
  className = '',
  children,
}) {
  const slides = useMemo(() => Children.toArray(children), [children]);
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  // Starts true and is only turned off once a real measurement proves every
  // card already fits (desktop): controls that scroll nothing would be a lie,
  // but they must never disappear just because layout hasn't been measured.
  const [scrollable, setScrollable] = useState(true);

  const scrollToIndex = useCallback((index) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    const target = track.children[clamped];
    if (!target) return;
    const left = target.offsetLeft - track.offsetLeft;
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
    } else {
      track.scrollLeft = left;
    }
    setActive(clamped);
  }, [slides.length]);

  // Keep the dots honest when the athlete swipes instead of using a control.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const measure = () => {
      if (track.scrollWidth > 0) setScrollable(track.scrollWidth > track.clientWidth + 4);
    };
    measure();
    window.addEventListener('resize', measure);
    const onScroll = () => {
      const positions = Array.from(track.children).map(
        (child) => Math.abs(child.offsetLeft - track.offsetLeft - track.scrollLeft),
      );
      let nearest = 0;
      positions.forEach((distance, i) => {
        if (distance < positions[nearest]) nearest = i;
      });
      setActive(nearest);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, [slides.length]);

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      scrollToIndex(active + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollToIndex(active - 1);
    }
  }

  const arrowClass =
    'hidden sm:flex absolute top-1/2 -translate-y-1/2 z-10 w-11 h-11 items-center justify-center rounded-full bg-white border border-[#E4E9F2] text-[#185FA5] shadow-[0_4px_14px_rgba(15,23,42,0.10)] disabled:opacity-0 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-2';

  return (
    <div className={`relative ${className}`}>
      {scrollable && (
      <button
        type="button"
        aria-label={`Previous — ${label}`}
        onClick={() => scrollToIndex(active - 1)}
        disabled={active === 0}
        className={`${arrowClass} left-0 -translate-x-1/4`}
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      )}

      <ul
        ref={trackRef}
        tabIndex={0}
        role="region"
        aria-label={label}
        aria-roledescription="carousel"
        onKeyDown={onKeyDown}
        // `scroll-pl-5` matters: without it scroll-snap aligns the first card
        // to the scrollport edge and eats the 20px page gutter, so the cards
        // sit flush against the screen edge instead of under the heading.
        className="no-scrollbar flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-pl-5 px-5 pb-1 -mx-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] focus-visible:ring-offset-4 focus-visible:ring-offset-[#FAFBFD] rounded-3xl"
      >
        {slides.map((slide, i) => (
          <li
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={slideLabel(i, slides.length)}
            className={`snap-start shrink-0 ${slideClass}`}
          >
            {slide}
          </li>
        ))}
      </ul>

      {scrollable && (
      <button
        type="button"
        aria-label={`Next — ${label}`}
        onClick={() => scrollToIndex(active + 1)}
        disabled={active === slides.length - 1}
        className={`${arrowClass} right-0 translate-x-1/4`}
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
      )}

      {scrollable && (
      <div className="flex items-center justify-center gap-0.5 mt-1">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollToIndex(i)}
            aria-label={`${label} — ${slideLabel(i, slides.length)}`}
            aria-current={active === i ? 'true' : undefined}
            className="w-11 h-11 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#185FA5] rounded-full"
          >
            <span
              aria-hidden="true"
              className={`block rounded-full transition-all ${
                active === i ? 'w-5 h-1.5 bg-[#185FA5]' : 'w-1.5 h-1.5 bg-[#CBD5E1]'
              }`}
            />
          </button>
        ))}
      </div>
      )}
    </div>
  );
}

export default LandingCarousel;
