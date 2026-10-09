'use client';

import { useRef, useState } from 'react';

/** Copy with the reference page's behaviour: "Copied" for 1.5 s, select the text if the clipboard is blocked. */
export function CopyButton({ text, selectId, disabled, label: idle = 'Copy', className }: {
  text: string | null; selectId?: string; disabled?: boolean; label?: string; className?: string;
}) {
  const [label, setLabel] = useState(idle);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fallback = () => {
    const el = selectId ? document.getElementById(selectId) : null;
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };
  const done = () => {
    setLabel('Copied');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLabel(idle), 1500);
  };

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || !text}
      onClick={() => {
        if (!text) return;
        try { navigator.clipboard.writeText(text).then(done, fallback); } catch { fallback(); }
      }}
    >
      {label}
    </button>
  );
}
