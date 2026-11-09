// What a new install does on its first activation, decided without VS Code so jest tests it
// directly. src/extension.ts gathers the facts and acts on the result.

/** globalState key set once the first-run decision has been made, so it is made only once. */
export const WELCOMED_KEY = 'gigglybits.welcomed';

/**
 * Context key the Get Started walkthrough's `when` clause reads. It is set only in a window
 * session that did not make the first-run decision, so the walkthrough stays hidden, and does
 * not open by itself, in the session that installed the extension and opened the Theme Lab.
 */
export const WALKTHROUGH_CONTEXT = 'gigglybits.walkthroughReady';

export interface FirstRunFacts {
  /** WELCOMED_KEY was already set when this activation started. */
  welcomed: boolean;
  /** This window has focus: the one where Install was clicked, not every open window. */
  focused: boolean;
  /** Signs of an earlier version: other globalState keys, saved themes or syntax sets, or a GigglyBits theme showing. */
  usedBefore: boolean;
}

export type FirstRunAction =
  /** Already decided in an earlier activation. */
  | 'none'
  /** An update for someone who has used the extension: record the decision, open nothing. */
  | 'mark'
  /** A new install in the focused window: record the decision and open the Theme Lab. */
  | 'openLab';

/**
 * What this activation does. An unfocused window decides nothing, so the focused window, or the
 * next focused activation, makes the decision.
 */
export function firstRunAction(facts: FirstRunFacts): FirstRunAction {
  if (facts.welcomed) { return 'none'; }
  if (facts.usedBefore) { return 'mark'; }
  return facts.focused ? 'openLab' : 'none';
}
