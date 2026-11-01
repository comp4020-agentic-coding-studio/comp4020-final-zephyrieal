import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH, REPORT_REASONS, type ChatBlock, type ChatMessage, type ChatServerMessage, type ReportReason } from "../../shared/chat.ts";
import { EventBus } from "../game/eventBus.ts";
import { presenceState } from "../game/presenceState.ts";

type Line = (ChatMessage & { pending?: boolean }) | { id: string; notice: string };
const isNotice = (line: Line): line is { id: string; notice: string } => "notice" in line;

// Public chat for whoever is inside the campfire area right now. The server
// decides membership and delivery; this only shows what arrives. A draft is
// never sent automatically, and there is no other destination to switch to.
export function CampfireChat() {
  // Starts minimised on small screens so it doesn't cover the game.
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 601px)").matches);
  const [member, setMember] = useState(false), [nearby, setNearby] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState(""), [error, setError] = useState("");
  const [blocks, setBlocks] = useState<ChatBlock[]>([]);
  const [muted, setMuted] = useState<Set<string>>(new Set()); // public avatar ids, this visit only
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // avatars blocked during this visit
  const [menu, setMenu] = useState<number | null>(null), [reporting, setReporting] = useState<number | null>(null);
  const [reason, setReason] = useState<ReportReason>("spam");
  const log = useRef<HTMLOListElement>(null), input = useRef<HTMLInputElement>(null);
  const wasMember = useRef(false), pendingBlock = useRef<string | null>(null);

  useEffect(() => {
    const receive = (msg: ChatServerMessage) => {
      if (msg.type === "chat-status") {
        setNearby(msg.nearby);
        if (msg.member === wasMember.current) return;
        wasMember.current = msg.member; setMember(msg.member); setError("");
        // Each visit starts fresh; leaving keeps this visit's history readable.
        if (msg.member) setLines([{ id: `n${Date.now()}`, notice: "You joined campfire chat." }]);
        else setLines(current => [...current.filter(l => isNotice(l) || !l.pending), { id: `n${Date.now()}`, notice: "You left the campfire. New messages won't reach you here." }]);
      } else if (msg.type === "chat-message") {
        const { clientId, ...message } = msg.message;
        setLines(current => {
          const mine = clientId ? current.findIndex(l => !isNotice(l) && l.clientId === clientId) : -1;
          if (mine < 0) return [...current, message].slice(-150);
          const next = current.slice(); next[mine] = message; return next;
        });
      } else if (msg.type === "chat-rejected") {
        setError(msg.reason);
        if (msg.clientId) setLines(current => {
          const failed = current.find(l => !isNotice(l) && l.clientId === msg.clientId) as ChatMessage | undefined;
          // Put an unsent message back in the box rather than losing it.
          if (failed) setDraft(d => d || failed.text);
          return current.filter(l => isNotice(l) || l.clientId !== msg.clientId);
        });
      } else if (msg.type === "chat-blocks") {
        setBlocks(msg.blocks);
        const playerId = pendingBlock.current;
        if (playerId) { pendingBlock.current = null; setHidden(h => new Set(h).add(playerId)); }
      } else if (msg.type === "chat-reported") {
        setError(""); setLines(current => [...current, { id: `n${Date.now()}`, notice: "Thanks — your report was sent with the recent conversation." }]);
      }
    };
    const lost = () => { if (!presenceState.connected && wasMember.current) receive({ type: "chat-status", member: false, nearby: 0 }); };
    EventBus.on("chat-server", receive); EventBus.on("presence-updated", lost);
    return () => { EventBus.off("chat-server", receive); EventBus.off("presence-updated", lost); };
  }, []);

  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [lines, open]);

  const send = (intent: unknown) => EventBus.emit("visitor-input", intent);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.replace(/\s+/g, " ").trim();
    if (!member || !text) return;
    const clientId = crypto.randomUUID();
    const self = presenceState.players.find(p => p.id === presenceState.selfId);
    setLines(current => [...current, { id: -Date.now(), clientId, pending: true, playerId: self?.id ?? "", name: "You", text, at: Date.now() }]);
    send({ type: "chat-send", text, clientId });
    setDraft(""); setError("");
  }
  const close = () => { setMenu(null); setReporting(null); };
  const visible = lines.filter(l => isNotice(l) || (!muted.has(l.playerId) && !hidden.has(l.playerId)));
  const selfId = presenceState.selfId;

  return <section className={`campfire-chat${open ? "" : " chat-closed"}`} aria-label="Campfire chat"
    onKeyDown={event => { if (event.key === "Escape") { close(); document.querySelector<HTMLElement>(".game-container")?.focus({ preventScroll: true }); } }}>
    <button type="button" className="chat-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>Campfire chat{member ? ` · ${nearby} nearby` : ""}</span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <>
      <p className="chat-audience"><strong>Campfire — Public.</strong> Everyone at the campfire can read this.</p>
      <ol className="chat-log" ref={log} aria-live="polite" aria-label="Campfire messages">
        {!visible.length && <li className="chat-notice">{member ? "Say hello, or just listen." : "Walk to the campfire to join the public chat."}</li>}
        {visible.map(line => isNotice(line)
          ? <li key={line.id} className="chat-notice">{line.notice}</li>
          : <li key={line.clientId ?? line.id} className={line.pending ? "chat-pending" : undefined}>
              <span className="chat-name">{line.playerId === selfId ? "You" : line.name}</span>{" "}
              <span className="chat-text">{line.text}</span>{line.pending && <span className="chat-sending"> · sending</span>}
              {line.playerId !== selfId && line.id > 0 && <span className="chat-menu">
                <button type="button" className="chat-more" aria-haspopup="true" aria-expanded={menu === line.id}
                  aria-label={`Options for ${line.name}'s message`} onClick={() => { setMenu(menu === line.id ? null : line.id); setReporting(null); }}>⋯</button>
                {menu === line.id && reporting !== line.id && <span className="chat-actions" role="group" aria-label={`Options for ${line.name}`}>
                  <button type="button" onClick={() => { setMuted(m => new Set(m).add(line.playerId)); close(); }}>Mute</button>
                  <button type="button" onClick={() => { pendingBlock.current = line.playerId; send({ type: "chat-block", messageId: line.id }); close(); }}>Block</button>
                  <button type="button" onClick={() => setReporting(line.id)}>Report</button>
                </span>}
                {reporting === line.id && <span className="chat-actions chat-report" role="group" aria-label={`Report ${line.name}`}>
                  <label>Reason <select value={reason} onChange={e => setReason(e.target.value as ReportReason)}>
                    {Object.entries(REPORT_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <button type="button" onClick={() => { send({ type: "chat-report", messageId: line.id, reason }); close(); }}>Send report</button>
                  <button type="button" onClick={close}>Cancel</button>
                </span>}
              </span>}
            </li>)}
      </ol>
      <form className="chat-form" onSubmit={submit}>
        <label htmlFor="campfire-chat-input" className="chat-label">Message everyone at the campfire</label>
        <div className="chat-row">
          <input id="campfire-chat-input" ref={input} type="text" autoComplete="off" maxLength={CHAT_MAX_LENGTH}
            value={draft} onChange={e => { setDraft(e.target.value); setError(""); }}
            placeholder={member ? "Say something kind…" : "Return to the campfire to send."}
            aria-describedby="campfire-chat-hint" />
          <button type="submit" disabled={!member || !draft.trim()}>Send</button>
        </div>
        <p id="campfire-chat-hint" className="chat-hint" role={error ? "alert" : undefined}>
          {error || (member ? `${draft.length}/${CHAT_MAX_LENGTH} · Esc returns to the game` : "Return to the campfire to send. Your draft is kept.")}
        </p>
      </form>
      {(blocks.length > 0 || muted.size > 0) && <details className="chat-blocked">
        <summary>Muted and blocked ({blocks.length + muted.size})</summary>
        {muted.size > 0 && <p>Muted for this visit: {muted.size} <button type="button" onClick={() => setMuted(new Set())}>Unmute all</button></p>}
        <ul>{blocks.map(b => <li key={b.id}>{b.name} <button type="button" onClick={() => send({ type: "chat-unblock", blockId: b.id })}>Unblock</button></li>)}</ul>
      </details>}
    </>}
  </section>;
}
