// src/firstRun.ts: what a new install does on its first activation.
import { firstRunAction } from '../src/firstRun';

describe('firstRunAction', () => {
  it('{#first-run-open} opens the Theme Lab on a new install in the focused window', () => {
    expect(firstRunAction({ welcomed: false, focused: true, usedBefore: false })).toBe('openLab');
  });

  it('decides nothing in an unfocused window, so another open window does not open a Lab too', () => {
    expect(firstRunAction({ welcomed: false, focused: false, usedBefore: false })).toBe('none');
  });

  it('{#first-run-update} only records the decision for someone updating from an earlier version', () => {
    expect(firstRunAction({ welcomed: false, focused: true, usedBefore: true })).toBe('mark');
    expect(firstRunAction({ welcomed: false, focused: false, usedBefore: true })).toBe('mark');
  });

  it('does nothing once the decision has been made', () => {
    expect(firstRunAction({ welcomed: true, focused: true, usedBefore: false })).toBe('none');
  });
});
