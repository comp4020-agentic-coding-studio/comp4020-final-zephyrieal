import { useEffect, useRef, useState } from "react";

export const NAME_MAX_LENGTH = 20; // mirrors src/server/names.ts

// Shown on a visitor's first arrival (and again from "Change name"). Naming
// is optional --- CLAUDE.md bans mandatory accounts --- so "Skip for now"
// always works and leaves the "Visitor xxxx" label in place. The name itself
// lives on the server, keyed to the anonymous visitor cookie.
export function WelcomeScreen({ initialName, onSave, onSkip }: {
  initialName: string;
  onSave: (name: string) => Promise<string | null>;
  onSkip: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) { setError("Type a name, or skip for now."); return; }
    setSaving(true);
    const failure = await onSave(trimmed);
    setSaving(false);
    if (failure) setError(failure);
  }

  return (
    <div className="welcome-backdrop" onKeyDown={e => { if (e.key === "Escape") onSkip(); }}>
      <form className="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" onSubmit={submit}>
        <span className="sidebar-kicker">A little world, together</span>
        <h2 id="welcome-title">{initialName ? "Change your name" : "Welcome to the sanctuary"}</h2>
        <p>What should the other visitors see above your head? No sign-in needed: this browser will remember you.</p>
        <label htmlFor="welcome-name">Your name</label>
        <input id="welcome-name" ref={input} type="text" autoComplete="nickname" maxLength={NAME_MAX_LENGTH}
          value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="e.g. Hay Enjoyer"
          aria-describedby={error ? "welcome-error" : undefined} />
        {error && <p id="welcome-error" className="welcome-error" role="alert">{error}</p>}
        <div className="welcome-actions">
          <button type="button" className="welcome-skip" onClick={onSkip}>{initialName ? "Cancel" : "Skip for now"}</button>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : "Enter the meadow"}</button>
        </div>
      </form>
    </div>
  );
}
