import { describe, expect, it } from 'vitest';
import { isPictureFront } from './display';

describe('picture fronts (emoji cards)', () => {
  it('emoji, regional-indicator letters and openmoji: codes are pictures; words are not', () => {
    for (const t of ['🛏️', '🧑‍🍳', '🇦', 'openmoji:E0C0', '\uE1DB', '👍🏽']) expect(isPictureFront(t), t).toBe(true);
    for (const t of ['het bed', 'A', '12:00u', '', '3 + 4']) expect(isPictureFront(t), t).toBe(false);
  });
});
