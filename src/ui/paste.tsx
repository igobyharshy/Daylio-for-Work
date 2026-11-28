import { useEffect, type RefObject } from 'react';
import { Btn, IBtn } from './kit';
import { Icon } from './Icon';

/** Lines of a pasted list, with bullets, numbers and checkboxes removed. Null when it's just one line.
 *  Handles lists copied from Notion, ChatGPT, Google Docs, Markdown, Trello and plain notes. */
export function splitPastedList(text: string | null | undefined): string[] | null {
  if (!text || !/\r|\n/.test(text.trim())) return null;
  const items = text.split(/\r\n|\r|\n|\u2028/).map(cleanLine).filter(Boolean);
  return items.length >= 2 ? items.slice(0, 100) : null;
}
const cleanLine = (l: string) => l
  .replace(/^\s*#{1,6}\s+/, '')                                   // markdown headings
  .replace(/^\s*(?:[-*+•◦▪▫‣⁃–—·●○■□►▸➤✓✔☐☑✅]|\d{1,3}[.)]|[a-zA-Z][.)](?=\s))\s*/, '') // bullet, "1." "1)" "a)"
  .replace(/^\[(?: |x|X)?\]\s*/, '')                              // "[ ]" / "[x]" checkboxes
  .replace(/^(\*\*|__)(.+)\1$/, '$2')                             // **bold line**
  .replace(/\s+/g, ' ')
  .trim();

/** Catch a multi-line paste in a single-line box (keyboard paste, the context menu, or a phone keyboard's
 *  clipboard chip) before the browser squashes it into one line. */
export function useListPaste(ref: RefObject<HTMLInputElement | null>, onList: (items: string[]) => void, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const take = (e: Event, text: string | null | undefined) => {
      const items = splitPastedList(text);
      if (!items) return;
      e.preventDefault();
      onList(items);
    };
    const onPaste = (e: ClipboardEvent) => take(e, e.clipboardData?.getData('text/plain'));
    const onBefore = (e: InputEvent) => {
      if (e.inputType === 'insertFromPaste' || e.inputType === 'insertText' || e.inputType === 'insertReplacementText')
        take(e, e.data ?? e.dataTransfer?.getData('text/plain'));
    };
    el.addEventListener('paste', onPaste);
    el.addEventListener('beforeinput', onBefore);
    return () => { el.removeEventListener('paste', onPaste); el.removeEventListener('beforeinput', onBefore); };
  });
}

/** What a pasted list will become: one row per item, remove any, then Enter (or the button) adds them all. */
export function PastedList({ items, noun, onChange, onAdd, onCancel }: { items: string[]; noun: [string, string]; onChange: (items: string[]) => void; onAdd: () => void; onCancel: () => void }) {
  const word = items.length === 1 ? noun[0] : noun[1];
  return (
    <div className="paste-list" role="region" aria-label={`Pasted list: ${items.length} ${word}`}>
      <div className="paste-head">
        <Icon name="bullets" size={18} />
        <span className="t-ls grow">One {noun[0]} per line</span>
        <Btn kind="text" onPointerDown={e => e.preventDefault()} onClick={onCancel}>Cancel</Btn>
        <Btn onPointerDown={e => e.preventDefault()} onClick={onAdd}>Add {items.length} {word}</Btn>
      </div>
      <ol className="paste-items">
        {items.map((x, i) => (
          <li key={i}>
            <span className="t-bm grow">{x}</span>
            <IBtn sm icon="close" label={`Leave out “${x}”`} onPointerDown={e => e.preventDefault()} onClick={() => { const n = items.filter((_, j) => j !== i); n.length ? onChange(n) : onCancel(); }} />
          </li>
        ))}
      </ol>
    </div>
  );
}
