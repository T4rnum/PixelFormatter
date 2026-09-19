import { useCallback, useState } from 'react';
import { DEFAULT_SETTINGS, EMPTY_EDITS, type PaletteEdits, type Settings } from '../core/types';
export interface EditorState {
  settings: Settings;
  edits: PaletteEdits;
}
const initial = (): EditorState => ({
  settings: { ...DEFAULT_SETTINGS },
  edits: { ...EMPTY_EDITS },
});
export function useHistory() {
  const [history, setHistory] = useState({
    past: [] as EditorState[],
    current: initial(),
    future: [] as EditorState[],
  });
  const commit = useCallback(
    (update: (current: EditorState) => EditorState) =>
      setHistory((h) => ({
        past: [...h.past.slice(-49), h.current],
        current: update(h.current),
        future: [],
      })),
    [],
  );
  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length
          ? {
              past: h.past.slice(0, -1),
              current: h.past[h.past.length - 1],
              future: [h.current, ...h.future],
            }
          : h,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length
          ? { past: [...h.past, h.current], current: h.future[0], future: h.future.slice(1) }
          : h,
      ),
    [],
  );
  const clear = useCallback(() => setHistory({ past: [], current: initial(), future: [] }), []);
  const reset = () => commit(initial);
  return {
    state: history.current,
    commit,
    undo,
    redo,
    clear,
    reset,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
  };
}
