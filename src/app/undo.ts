import { useEffect } from 'react';
import { useStore } from '../lib/store';
import { useToast } from '../ui/Toast';

const editable = (el: EventTarget | null) => {
  const e = el as HTMLElement | null;
  if (!e) return false;
  if (e.isContentEditable) return true;
  if (e.tagName === 'TEXTAREA') return !(e as HTMLTextAreaElement).readOnly;
  if (e.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes((e as HTMLInputElement).type) && !(e as HTMLInputElement).readOnly;
  return false;
};

/** Ctrl/⌘+Z undoes the last change anywhere in the app (up to 50 steps); Ctrl+Shift+Z or Ctrl+Y redoes.
 *  While typing in a box, the keys keep their normal job of undoing the typing. */
export function useUndoKeys() {
  const st = useStore();
  const toast = useToast();
  useEffect(() => {
    const run = (redo: boolean) => {
      const label = redo ? st.redo() : st.undo();
      if (!label) { toast.show(redo ? 'Nothing to redo' : 'Nothing to undo', { icon: 'info', duration: 2000 }); return; }
      toast.show(`${redo ? 'Redid' : 'Undid'} ${label}`, { icon: redo ? 'redo' : 'undo', duration: 4000, action: { label: redo ? 'Undo' : 'Redo', onClick: () => run(!redo) } });
    };
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || editable(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); run(e.shiftKey); }
      else if (k === 'y' && !e.shiftKey) { e.preventDefault(); run(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [st, toast]);
}
