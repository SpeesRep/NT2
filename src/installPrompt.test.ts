import { describe, expect, it } from 'vitest';
import { canOfferInstall } from './installPrompt';

describe('Android "App installeren" button', () => {
  it('only with the browser event, after a first completed session, and not once installed', () => {
    expect(canOfferInstall(true, true, false)).toBe(true);
    expect(canOfferInstall(true, false, false)).toBe(false); // first load: no session yet
    expect(canOfferInstall(false, true, false)).toBe(false); // iOS / not installable
    expect(canOfferInstall(true, true, true)).toBe(false); // already on the home screen
  });
});
