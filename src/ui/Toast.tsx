import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ToastOpts { action?: { label: string; onClick: () => void }; action2?: { label: string; onClick: () => void }; icon?: IconName; duration?: number }
interface ToastItem extends ToastOpts { id: number; msg: string }
interface ToastApi { show: (msg: string, o?: ToastOpts) => void; hide: () => void }

const Ctx = createContext<ToastApi>({ show: () => {}, hide: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const hide = useCallback(() => { setItem(null); window.clearTimeout(timer.current); }, []);
  const show = useCallback((msg: string, o: ToastOpts = {}) => {
    window.clearTimeout(timer.current);
    setItem({ id: Date.now(), msg, ...o });
    timer.current = window.setTimeout(() => setItem(null), o.duration ?? (o.action ? 8000 : 5000));
  }, []);
  const api = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {item && (
        <div className="snackbar" role="status" key={item.id}>
          {item.icon && <Icon name={item.icon} className="lead" />}
          <span className="t-bm">{item.msg}</span>
          {item.action && <button className="btn text state" onClick={() => { item.action!.onClick(); hide(); }}>{item.action.label}</button>}
          {item.action2 && <button className="btn text state" onClick={() => { item.action2!.onClick(); hide(); }}>{item.action2.label}</button>}
          <button className="ibtn state" aria-label="Dismiss" onClick={hide}><Icon name="close" /></button>
        </div>
      )}
    </Ctx.Provider>
  );
}
