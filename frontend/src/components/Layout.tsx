import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { usePoll } from "../lib/usePoll";
import { useQueue } from "../state/queue";
import { Glitch } from "./Glitch";

const NAV = [
  { to: "/", label: "Triage", key: "1" },
  { to: "/batch", label: "Batch", key: "2" },
  { to: "/queue", label: "Queue", key: "3" },
  { to: "/system", label: "System", key: "4" },
] as const;

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="mono-num">{now.toLocaleTimeString(undefined, { hour12: false })}</span>;
}

export function StatusBar() {
  const fetchHealth = useCallback((s: AbortSignal) => api.health(s), []);
  const health = usePoll(fetchHealth, 10_000);
  const up = health.data?.status === "ok" && !health.error;
  const state = health.loading && !health.data ? "probing" : up ? "online" : "offline";

  return (
    <header className="statusbar">
      <div className="statusbar__cell statusbar__brand split">TRIAGE//SIGNAL</div>
      <div className="statusbar__cell" data-testid="api-status" data-state={state} aria-live="polite">
        <span className={`led ${state === "online" ? "led--ok" : state === "offline" ? "led--down" : ""}`} aria-hidden="true" />
        api {state}
        {up && health.data ? <span className="faint">· {health.data.provider}</span> : null}
      </div>
      <div className="statusbar__cell statusbar__ticker" aria-hidden="true">
        <span className="ticker">
          guardrail → redact → cache → extract → validate ── injection attempts are rejected before the model ── emails, phones and card
          numbers are stripped from prompts ── identical messages are served from cache at zero cost ──
        </span>
      </div>
      <div className="statusbar__cell statusbar__clock">
        <Clock />
      </div>
    </header>
  );
}

export function Layout() {
  const { entries } = useQueue();
  const open = entries.filter((e) => !e.resolved).length;
  const navigate = useNavigate();

  // Alt+1..4 jumps between screens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = NAV.find((n) => n.key === e.key);
      if (item) {
        e.preventDefault();
        navigate(item.to);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="shell">
      <StatusBar />
      <aside className="rail">
        <div className="rail__logo">
          <Glitch text="T//S" />
          <small>support signal triage</small>
        </div>
        <nav aria-label="Main">
          {NAV.map((item, i) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className="navlink">
              <span className="navlink__num">0{i + 1}</span>
              <span>{item.label}</span>
              {item.to === "/queue" ? (
                <span className="navlink__count" aria-label={`${open} open tickets`}>
                  {open}
                </span>
              ) : (
                <span />
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rail__foot">
          <div>
            <kbd>Alt</kbd> + <kbd>1-4</kbd> switch screen
          </div>
          <div>
            <kbd>Ctrl</kbd> + <kbd>Enter</kbd> submit
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHead({ kicker, title, children, aside }: { kicker: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <span className="page-head__kicker">{kicker}</span>
        <Glitch as="h1" text={title} />
        {children ? <p>{children}</p> : null}
      </div>
      {aside}
    </div>
  );
}
