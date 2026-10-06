import { describe, expect, it } from 'vitest';
import { fingerprint, isHelpUpdated } from './helpSeen';

describe('Hulp "nieuw" marker', () => {
  it('shows only when she saw an earlier, different version', () => {
    expect(isHelpUpdated(null, 'text v1')).toBe(false); // never opened → not flagged
    expect(isHelpUpdated(fingerprint('text v1'), 'text v1')).toBe(false); // seen, unchanged
    expect(isHelpUpdated(fingerprint('text v1'), 'text v2')).toBe(true); // changed by a new version
  });
});
