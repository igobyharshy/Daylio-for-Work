import { useCallback, useEffect, useRef } from 'react';

/**
 * Pointer-based drag and drop for task lists and boards (mouse, pen and touch).
 * - Draggables: spread `dragProps(id)` on the element (it gets data-drag-id).
 *   Mouse drags start after a 6px move anywhere on the item; touch drags start from an element with [data-drag-handle].
 * - Drop zones: any element with data-drop-group="<name>" whose children are the draggables in order.
 * onDrop(id, group, beforeId) — beforeId is the item it was dropped above (null = end of the group).
 */
export function useDragSort(onDrop: (id: string, group: string, beforeId: string | null) => void) {
  const cb = useRef(onDrop); cb.current = onDrop;
  const st = useRef<{ id: string; el: HTMLElement; x: number; y: number; dx: number; dy: number; ghost?: HTMLElement; active: boolean; target?: { group: string; before: string | null }; lx: number; ly: number; timer?: number } | null>(null);

  const clearMarks = () => {
    document.querySelectorAll('.drop-before, .drop-end, .drop-over').forEach(n => n.classList.remove('drop-before', 'drop-end', 'drop-over'));
  };

  const move = useCallback((e: PointerEvent) => {
    const s = st.current; if (!s) return;
    if (!s.active) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
      s.active = true;
      const r = s.el.getBoundingClientRect();
      const g = s.el.cloneNode(true) as HTMLElement;
      g.classList.add('drag-ghost');
      Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none', zIndex: '100', margin: '0' });
      document.body.appendChild(g);
      s.ghost = g; s.dx = s.x - r.left; s.dy = s.y - r.top;
      s.el.classList.add('dragging');
      document.body.classList.add('is-dragging');
      // auto-scroll the page (and a board sideways) when dragging near an edge
      s.timer = window.setInterval(() => {
        const c = st.current; if (!c) return;
        const main = document.querySelector('.main') as HTMLElement | null;
        const r = main?.getBoundingClientRect();
        if (main && r) {
          if (c.ly < r.top + 72) main.scrollTop -= 14;
          else if (c.ly > r.bottom - 72) main.scrollTop += 14;
        }
        const board = (document.elementFromPoint(c.lx, c.ly) as HTMLElement | null)?.closest('.board') as HTMLElement | null;
        if (board) { const b = board.getBoundingClientRect(); if (c.lx < b.left + 60) board.scrollLeft -= 14; else if (c.lx > b.right - 60) board.scrollLeft += 14; }
      }, 16);
    }
    s.lx = e.clientX; s.ly = e.clientY;
    e.preventDefault();
    if (s.ghost) { s.ghost.style.left = e.clientX - s.dx + 'px'; s.ghost.style.top = e.clientY - s.dy + 'px'; }
    clearMarks();
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const zone = under?.closest('[data-drop-group]') as HTMLElement | null;
    if (!zone) { s.target = undefined; return; }
    const items = Array.from(zone.querySelectorAll<HTMLElement>('[data-drag-id]')).filter(n => n !== s.el && n.closest('[data-drop-group]') === zone);
    const next = items.find(n => { const r = n.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    s.target = { group: zone.dataset.dropGroup!, before: next?.dataset.dragId ?? null };
    zone.classList.add('drop-over');
    if (next) next.classList.add('drop-before'); else zone.classList.add('drop-end');
  }, []);

  const end = useCallback(() => {
    const s = st.current; st.current = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (!s) return;
    window.clearInterval(s.timer);
    clearMarks();
    s.el.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    s.ghost?.remove();
    if (s.active) {
      // swallow the click that follows a drag
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
      if (s.target && (s.target.before !== s.id)) cb.current(s.id, s.target.group, s.target.before);
    }
  }, [move]);

  useEffect(() => () => { end(); }, [end]);

  const dragProps = useCallback((id: string) => ({
    'data-drag-id': id,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      const handle = !!t.closest('[data-drag-handle]');
      if (e.pointerType !== 'mouse' && !handle) return;
      if (!handle && t.closest('button, input, textarea, a, [role="button"], .no-drag')) return;
      st.current = { id, el: e.currentTarget, x: e.clientX, y: e.clientY, dx: 0, dy: 0, active: false, lx: e.clientX, ly: e.clientY };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
  }), [move, end]);

  return dragProps;
}
