import type { PhotoSlot, StripTemplateDraft } from '@vyora/shared';

type Layout = { slots: PhotoSlot[]; layer: StripTemplateDraft['layer'] };
type Draft = StripTemplateDraft | null;
export type DraftUpdate = Draft | ((current: Draft) => Draft);
export interface TemplateHistory {
  draft: Draft;
  initial: Layout | null;
  past: Layout[];
  future: Layout[];
  pending: Layout | null;
}
type Action =
  | { type: 'load'; draft: StripTemplateDraft }
  | { type: 'edit'; update: DraftUpdate }
  | { type: 'begin' | 'commit' | 'cancel' | 'undo' | 'redo' | 'revert' };

export const emptyTemplateHistory = (): TemplateHistory => ({
  draft: null,
  initial: null,
  past: [],
  future: [],
  pending: null,
});
const snapshot = (draft: Layout): Layout => ({
  layer: draft.layer,
  slots: draft.slots.map((slot) => ({ ...slot })),
});
export const sameTemplateLayout = (a: Layout, b: Layout) =>
  a.layer === b.layer &&
  a.slots.length === b.slots.length &&
  a.slots.every(
    (slot, index) =>
      (slot.rotation ?? 0) === (b.slots[index].rotation ?? 0) &&
      (['x', 'y', 'width', 'height'] as const).every(
        (key) => slot[key] === b.slots[index][key],
      ),
  );
const remember = (past: Layout[], layout: Layout) =>
  [...past, snapshot(layout)].slice(-100);

// History stores small layout snapshots, never copies of the imported bitmap.
// A pointer gesture is one edit even when it produces hundreds of move events.
export function templateHistoryReducer(
  state: TemplateHistory,
  action: Action,
): TemplateHistory {
  if (action.type === 'load')
    return {
      ...emptyTemplateHistory(),
      draft: action.draft,
      initial: snapshot(action.draft),
    };
  if (!state.draft) return state;
  if (action.type === 'begin')
    return state.pending ? state : { ...state, pending: snapshot(state.draft) };
  if (action.type === 'cancel')
    return state.pending
      ? { ...state, draft: { ...state.draft, ...state.pending }, pending: null }
      : state;
  if (action.type === 'commit') {
    if (!state.pending) return state;
    return sameTemplateLayout(state.pending, state.draft)
      ? { ...state, pending: null }
      : {
          ...state,
          past: remember(state.past, state.pending),
          future: [],
          pending: null,
        };
  }
  if (action.type === 'edit') {
    const next =
      typeof action.update === 'function'
        ? action.update(state.draft)
        : action.update;
    if (!next) return state;
    if (state.pending || sameTemplateLayout(state.draft, next))
      return { ...state, draft: next };
    return {
      ...state,
      draft: next,
      past: remember(state.past, state.draft),
      future: [],
    };
  }
  if (state.pending) return state;
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? {
          ...state,
          draft: { ...state.draft, ...snapshot(previous) },
          past: state.past.slice(0, -1),
          future: remember(state.future, state.draft),
        }
      : state;
  }
  if (action.type === 'redo') {
    const next = state.future.at(-1);
    return next
      ? {
          ...state,
          draft: { ...state.draft, ...snapshot(next) },
          past: remember(state.past, state.draft),
          future: state.future.slice(0, -1),
        }
      : state;
  }
  if (
    action.type === 'revert' &&
    state.initial &&
    !sameTemplateLayout(state.draft, state.initial)
  )
    return {
      ...state,
      draft: { ...state.draft, ...snapshot(state.initial) },
      past: remember(state.past, state.draft),
      future: [],
    };
  return state;
}
