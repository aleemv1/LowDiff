import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Mode, Note } from '@lowdiff/core';
import type { AnnotateReply, ChatTurn, PrLocation, PublicSettingsReply } from '../shared/messages.js';
import { C } from './theme.js';
import { SummaryCard } from './components/SummaryCard.js';
import { NotePopover } from './components/NotePopover.js';
import { ChatPanel } from './components/ChatPanel.js';
import { clearBadges, highlightNote, setActiveBadge, syncBadges } from './annotate.js';
import { detectDiffDom } from './dom/index.js';
import { watch } from './watch.js';

interface Props {
  pr: PrLocation;
}

interface Open {
  note: Note;
  top: number;
  left: number;
}

const POPOVER_WIDTH = 440;

/**
 * Owns the summary card, the note popover, and the chat panel.
 *
 * The per-line badges are not rendered here — they are injected into GitHub's
 * own diff rows by `syncBadges`, so the annotations sit on the real diff the
 * reviewer is already reading rather than on a copy of it.
 */
export function Overlay({ pr }: Props) {
  const [mode, setMode] = useState<Mode>('review');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(0);

  const [open, setOpen] = useState<Open | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');

  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;

  const rootRef = useRef<HTMLDivElement | null>(null);

  const select = useCallback((note: Note, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    // Coordinates are relative to `.root`, which is the popover's containing
    // block — page coordinates would be offset by whatever GitHub positions
    // around us.
    const base = rootRef.current?.getBoundingClientRect();
    if (!base) return;

    setActiveBadge(element);
    const dom = detectDiffDom();
    if (dom) highlightNote(note, dom);
    // Flip above the badge when there is not room below, so the popover is not
    // cut off by the bottom of the viewport. The height is an estimate — note
    // bodies are capped, so this is bounded — and it only picks a side.
    const estimatedHeight = note.code ? 320 : 200;
    const openUpward = rect.bottom + estimatedHeight > window.innerHeight;

    setOpen({
      note,
      top: openUpward
        ? rect.top - base.top - estimatedHeight - 8
        : rect.bottom - base.top + 8,
      // Right-align the 440px popover to the badge, clamped to the page width.
      left: Math.max(
        12 - base.left,
        Math.min(rect.right - base.left - POPOVER_WIDTH, window.innerWidth - base.left - 452),
      ),
    });
  }, []);

  const closePopover = useCallback(() => {
    setActiveBadge(null);
    const dom = detectDiffDom();
    if (dom) highlightNote(null, dom);
    setOpen(null);
  }, []);

  /** Keep badges on the rows GitHub has rendered so far. */
  useEffect(() => {
    if (notes.length === 0) {
      clearBadges();
      setPlaced(0);
      return;
    }

    let lastSignature = '';

    return watch(() => {
      const dom = detectDiffDom();
      if (!dom) return;

      // Redo the pass only when the rendered diff actually changed. GitHub
      // renders large diffs progressively, so rows keep arriving.
      const signature = `${dom.name}:${document.querySelectorAll('[data-line-number]').length}`;
      if (signature === lastSignature) return;
      lastSignature = signature;

      setPlaced(syncBadges(notes, dom, ({ note, element }) => select(note, element)));
    });
  }, [notes, select]);

  const run = useCallback(
    async (nextMode: Mode, refresh: boolean) => {
      setBusy(true);
      setError(null);
      const reply = (await chrome.runtime.sendMessage({
        type: 'ANNOTATE',
        pr,
        mode: nextMode,
        refresh,
      })) as AnnotateReply;

      setBusy(false);
      if (!reply.ok) {
        setError(reply.error);
        setNotes([]);
        return;
      }
      setSummary(reply.summary);
      setNotes(reply.notes);
      setCached(reply.cached);
    },
    [pr],
  );

  useEffect(() => {
    void (async () => {
      const reply = (await chrome.runtime.sendMessage({
        type: 'GET_PUBLIC_SETTINGS',
      })) as PublicSettingsReply;

      const startMode = reply.ok ? reply.settings.defaultMode : 'review';
      setMode(startMode);

      if (reply.ok && !reply.settings.configured) {
        setBusy(false);
        setError('LowDiff needs an API key before it can review this pull request.');
        return;
      }
      await run(startMode, false);
    })();
  }, [run]);

  const send = (question: string) => {
    if (!question.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setTyping(true);

    const portName = `lowdiff-chat:${Date.now()}`;
    const port = chrome.runtime.connect({ name: portName });
    let answer = '';
    let started = false;

    port.onMessage.addListener((delta: { type: string; text?: string; error?: string }) => {
      if (delta.type === 'text' && delta.text) {
        answer += delta.text;
        setTyping(false);
        setMessages((prev) => {
          const next = [...prev];
          if (started) next[next.length - 1] = { role: 'assistant', content: answer };
          else next.push({ role: 'assistant', content: answer });
          started = true;
          return next;
        });
      } else if (delta.type === 'error') {
        setTyping(false);
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠ ${delta.error}` }]);
        port.disconnect();
      } else if (delta.type === 'done') {
        setTyping(false);
        port.disconnect();
      }
    });

    void chrome.runtime.sendMessage({
      type: 'CHAT',
      pr,
      question,
      history: messages,
      port: portName,
      mode,
    });
  };

  const notesLost = notes.length - placed;

  return (
    <div class="root" ref={rootRef}>
      <SummaryCard
        summary={error ?? summary}
        notes={notes}
        mode={mode}
        cached={cached}
        busy={busy}
        onMode={(next) => {
          if (next === mode) return;
          setMode(next);
          closePopover();
          void run(next, false);
        }}
        onRefresh={() => void run(mode, true)}
      />

      {notesLost > 0 && !busy && (
        <div
          style={{
            border: `1px solid ${C.accentBorder}`, borderRadius: '10px', padding: '10px 14px',
            marginBottom: '16px', background: C.accentTint,
            font: `12px/1.55 'DM Sans',sans-serif`, color: C.body,
          }}
        >
          {notesLost} note{notesLost === 1 ? '' : 's'} couldn't be placed — those lines
          aren't rendered on this page yet. Expand the collapsed files and they'll appear.
        </div>
      )}

      {open && (
        <div
          style={{
            position: 'absolute', top: `${open.top}px`, left: `${open.left}px`,
            width: `${POPOVER_WIDTH}px`, zIndex: 2147483000,
          }}
        >
          <NotePopover
            note={open.note}
            floating
            onClose={closePopover}
            onAsk={(note) => {
              closePopover();
              setChatOpen(true);
              send(`About "${note.title}" at ${note.anchor.path}:${note.anchor.line} — tell me more.`);
            }}
          />
        </div>
      )}

      {chatOpen ? (
        <ChatPanel
          messages={messages}
          typing={typing}
          input={input}
          contextChips={[`PR #${pr.number}`, 'diff', `${notes.length} findings`]}
          onInput={setInput}
          onSend={() => send(input)}
          onClose={() => setChatOpen(false)}
        />
      ) : (
        <div
          onClick={() => setChatOpen(true)}
          title="Ask AI"
          style={{
            position: 'fixed', right: '36px', bottom: '36px', zIndex: 2147483000,
            width: '54px', height: '54px', borderRadius: '50%',
            background: 'linear-gradient(120deg,#5b5bd6,#7c5bd6)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', cursor: 'pointer', boxShadow: '0 8px 24px rgba(91,91,214,.4)',
          }}
        >
          💬
        </div>
      )}
    </div>
  );
}
