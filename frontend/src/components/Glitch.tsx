import { useEffect, useState, type ElementType } from "react";

type GlitchProps = {
  text: string;
  as?: ElementType;
  hot?: boolean;
  className?: string;
};

/** Text with red/cyan channel ghosts that slice in and out (CSS-only). */
export function Glitch({ text, as: Tag = "span", hot = false, className = "" }: GlitchProps) {
  return (
    <Tag className={`glitch ${hot ? "glitch--hot" : ""} ${className}`.trim()} data-text={text}>
      {text}
    </Tag>
  );
}

const GLYPHS = "▓▒░█<>/\\|_-=+*#%@$&01ABCDEFXYZ";

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function noise(length: number) {
  return Array.from({ length }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join("");
}

/** Endless scrambled line — used as the "decoding" loading state. */
export function Scramble({ length = 24, label }: { length?: number; label: string }) {
  const [text, setText] = useState(() => noise(length));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setText(noise(length)), 70);
    return () => clearInterval(id);
  }, [length]);

  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="scramble" aria-hidden="true">
        {text}
      </div>
      <div className="eyebrow" style={{ marginTop: 8 }} aria-hidden="true">
        {label}
      </div>
    </div>
  );
}
