// Per-sport Home illustration: one drawing per onboarding sport, with a
// neutral fallback for anything else.

import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import SportArt, { SPORT_ART_KEYS, sportArtKey } from '../src/components/visuals/SportArt.jsx';

const ONBOARDING_SPORTS = ['cricket', 'football', 'badminton', 'athletics', 'wrestling', 'boxing', 'kabaddi', 'tennis', 'hockey', 'swimming', 'other'];

describe('SportArt', () => {
  test('has a drawing for every sport the onboarding offers', () => {
    expect([...SPORT_ART_KEYS].sort()).toEqual([...ONBOARDING_SPORTS].sort());
  });

  test('matches the stored sport regardless of case, and falls back to the neutral drawing', () => {
    expect(sportArtKey('Cricket')).toBe('cricket');
    expect(sportArtKey(' KABADDI ')).toBe('kabaddi');
    expect(sportArtKey('Archery')).toBe('other');
    expect(sportArtKey(undefined)).toBe('other');
  });

  test('renders a decorative svg with real shapes for each sport', () => {
    for (const sport of ONBOARDING_SPORTS) {
      const { container, unmount } = render(<SportArt sport={sport} />);
      const svg = container.querySelector('svg');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('data-sport-art')).toBe(sport);
      expect(svg.children.length).toBeGreaterThan(2);
      unmount();
    }
  });
});
