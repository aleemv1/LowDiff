import { createPortal } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Mode, Note, NoteKind } from '@lowdiff/core';
import { REVIEW_KINDS } from '@lowdiff/core';
import type { AnnotateReply, ChatTurn, PrLocation, PublicSettingsReply } from '../shared/messages.js';
import { C } from './theme.js';
import { SummaryCard } from './components/SummaryCard.js';
import { Sparkle } from './components/Sparkle.js';
import { NotePopover } from './components/NotePopover.js';
import { ChatPanel } from './components/ChatPanel.js';
import { clearBadges, highlightNote, setActiveBadge, syncBadges } from './annotate.js';
import { detectDiffDom } from './dom/index.js';
import { watch } from './watch.js';

interface Props {
  pr: PrLocation;
  /** Container in the document.body-level shadow host for floating UI. */
  overlayRoot: Element;
}

interface Open {
  note: Note;
  top: number;
  left: number;
}

const POPOVER_WIDTH = 440;

/**
 * A reloaded extension (every dev rebuild) orphans this script and only a page
 * reload reconnects it. Orphaned chrome.* calls do not fail reliably — some
 * throw, some hang forever — so check for the condition instead of waiting on
 * the round-trip, and say what to do instead of leaving the card on a spinner.
 */
const REFRESH_HINT = 'LowDiff was updated. Refresh the page to reconnect.';

function orphaned(): boolean {
  try {
    return !chrome.runtime?.id;
  } catch {
    return true;
  }
}

function describeFailure(cause: unknown): string {
  if (orphaned()) return REFRESH_HINT;
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The settings round-trip is a storage read — milliseconds, even with a cold
 * worker start. An orphaned script's calls can hang without ever rejecting
 * (and with `chrome.runtime.id` still set), so the hang is the one reliable
 * signal, and a generous deadline on a fast call cannot misfire on slowness.
 */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((deliver, reject) => {
    const timer = setTimeout(() => reject(new Error(REFRESH_HINT)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        deliver(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

/**
 * Owns the summary card, the note popover, and the chat panel.
 *
 * The per-line badges are not rendered here — they are injected into GitHub's
 * own diff rows by `syncBadges`, so the annotations sit on the real diff the
 * reviewer is already reading rather than on a copy of it.
 */
export function Overlay({ pr, overlayRoot }: Props) {
  const [mode, setMode] = useState<Mode>('review');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [hiddenKinds, setHiddenKinds] = useState<NoteKind[]>([]);
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(0);

  const [open, setOpen] = useState<Open | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const [activity, setActivity] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [repos, setRepos] = useState<string[]>([]);

  // One scan carries every kind; the Review/Explain toggle and the popup's
  // kind filter are both display-time lenses over it, so switching either is
  // instant and free.
  const viewNotes = useMemo(
    () => notes.filter((note) => mode === 'explain' || REVIEW_KINDS.includes(note.kind)),
    [notes, mode],
  );
  const visibleNotes = useMemo(
    () => viewNotes.filter((note) => !hiddenKinds.includes(note.kind)),
    [viewNotes, hiddenKinds],
  );
  // Kept out by the lens, not the user's filter — say so, or the Review view
  // silently sits on explanation the reader never learns exists.
  const explainOnly = useMemo(
    () =>
      mode === 'review'
        ? notes.filter((n) => !REVIEW_KINDS.includes(n.kind) && !hiddenKinds.includes(n.kind))
            .length
        : 0,
    [notes, mode, hiddenKinds],
  );

  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const select = useCallback((note: Note, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();

    setActiveBadge(element);
    const dom = detectDiffDom();
    const lit = dom ? highlightNote(note, dom) : null;

    // Anchor to the highlighted range rather than the badge. Opening against
    // the badge put the popover on top of the very lines it had just
    // highlighted, which defeats the point of highlighting them.
    const anchorRect = lit ?? rect;

    // Viewport (position:fixed) coordinates, like the chat button. Absolute
    // positioning depended on a containing block inside GitHub's DOM being
    // where we assumed — one transformed or containing ancestor and the
    // popover landed nowhere visible. Fixed coordinates cannot miss; the
    // layout effect below corrects any bottom overflow after render.
    const top = Math.max(12, Math.min(anchorRect.bottom + 8, window.innerHeight - 160));
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12));
    console.info('[LowDiff] popover open', { top, left, lit: Boolean(lit) });
    setOpen({ note, top, left });
  }, []);

  const closePopover = useCallback(() => {
    setActiveBadge(null);
    const dom = detectDiffDom();
    if (dom) highlightNote(null, dom);
    setOpen(null);
  }, []);

  /** Keep badges on the rows GitHub has rendered so far. */
  useEffect(() => {
    if (visibleNotes.length === 0) {
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
      const signature = `${dom.name}:${document.querySelectorAll('[data-line-number]').length}:${hiddenKinds.join(',')}`;
      if (signature === lastSignature) return;
      lastSignature = signature;

      setPlaced(syncBadges(visibleNotes, dom, ({ note, element }) => select(note, element)));
    });
  }, [visibleNotes, hiddenKinds, select]);

  const run = useCallback(
    async (refresh: boolean) => {
      if (orphaned()) {
        setBusy(false);
        setError(REFRESH_HINT);
        setNotes([]);
        return;
      }
      setBusy(true);
      setError(null);
      let reply: AnnotateReply;
      try {
        reply = (await chrome.runtime.sendMessage({
          type: 'ANNOTATE',
          pr,
          refresh,
        })) as AnnotateReply;
      } catch (cause) {
        setBusy(false);
        setError(describeFailure(cause));
        setNotes([]);
        return;
      }

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
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>) => {
      const next = changes['lowdiff:settings']?.newValue as
        | { hiddenKinds?: NoteKind[] }
        | undefined;
      if (next) setHiddenKinds(next.hiddenKinds ?? []);
    };
    // Synchronous throw when orphaned; there are no settings to track then.
    try {
      chrome.storage.onChanged.addListener(onStorage);
    } catch {
      return;
    }
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, []);

  useEffect(() => {
    // Orphaned sendMessage throws synchronously — past the reach of .catch().
    try {
      void chrome.runtime
        .sendMessage({ type: 'LIST_REPOS' })
        .then((reply: { ok: boolean; repos?: string[] }) => {
          if (reply.ok && reply.repos) setRepos(reply.repos);
        })
        .catch(() => {});
    } catch {
      // Repos stay empty; the card below reports the refresh hint.
    }
    void (async () => {
      if (orphaned()) {
        setBusy(false);
        setError(REFRESH_HINT);
        return;
      }
      let reply: PublicSettingsReply;
      try {
        reply = (await withDeadline(
          chrome.runtime.sendMessage({ type: 'GET_PUBLIC_SETTINGS' }),
          2500,
        )) as PublicSettingsReply;
      } catch (cause) {
        setBusy(false);
        setError(describeFailure(cause));
        return;
      }

      setMode(reply.ok ? reply.settings.defaultMode : 'review');
      if (reply.ok) setHiddenKinds(reply.settings.hiddenKinds);

      if (reply.ok && !reply.settings.configured) {
        setBusy(false);
        setError('LowDiff needs an API key before it can review this pull request.');
        return;
      }
      await run(false);
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

    port.onMessage.addListener((delta: { type: string; text?: string; error?: string; label?: string; inputTokens?: number; outputTokens?: number; rounds?: number }) => {
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
      } else if (delta.type === 'tool' && delta.label) {
        setTyping(true);
        setActivity(delta.label);
      } else if (delta.type === 'usage') {
        const tokens = `${((delta.inputTokens ?? 0) / 1000).toFixed(1)}k in / ${delta.outputTokens ?? 0} out`;
        // Anthropic list price; close enough for a visibility line.
        const dollars = ((delta.inputTokens ?? 0) * 5 + (delta.outputTokens ?? 0) * 25) / 1e6;
        setUsage(
          `${delta.rounds ? `${delta.rounds} search${delta.rounds === 1 ? '' : 'es'} · ` : ''}${tokens} ≈ $${dollars.toFixed(3)}`,
        );
        setActivity(null);
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
    });
  };

  /**
   * The pre-render position uses an estimated height. Once the popover has a
   * real height, nudge it back on-screen if the estimate was short — the
   * measurement happens before paint, so there is no visible jump.
   */
  useLayoutEffect(() => {
    const el = popoverRef.current;
    const base = rootRef.current;
    if (!el || !base || !open) return;
    const rect = el.getBoundingClientRect();
    const overflow = rect.bottom - (window.innerHeight - 12);
    const minTop = 12 - base.getBoundingClientRect().top;
    if (overflow > 0) {
      setOpen((current) =>
        current ? { ...current, top: Math.max(minTop, current.top - overflow) } : current,
      );
    }
    // Re-run when the note changes; open.top updates must not loop, so only
    // shift when there is genuine overflow.
  }, [open?.note]);

  /**
   * The open position guesses; the rendered popover knows. Before paint,
   * shift it up if it overflows the bottom of the viewport.
   */
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !open) return;
    const rect = el.getBoundingClientRect();
    const overflow = rect.bottom - (window.innerHeight - 12);
    if (overflow > 1) {
      setOpen((current) =>
        current ? { ...current, top: Math.max(12, current.top - overflow) } : current,
      );
    }
  }, [open?.note]);

  /**
   * Fixed positioning detaches from the page on scroll, so close rather than
   * drift — but not on the micro-scrolls the browser itself causes around the
   * opening click (focus adjustments, GitHub's own nudges). A real scroll has
   * distance and happens after the click settles.
   */
  useEffect(() => {
    if (!open) return;
    const openedAt = performance.now();
    const startY = window.scrollY;
    const onScroll = () => {
      if (performance.now() - openedAt < 300) return;
      if (Math.abs(window.scrollY - startY) < 48) return;
      closePopover();
    };
    // Capture phase: GitHub scrolls nested containers, and scroll does not bubble.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [open, closePopover]);

  const notesLost = visibleNotes.length - placed;
  const notesHidden = viewNotes.length - visibleNotes.length;

  return (
    <div class="root" ref={rootRef}>
      <SummaryCard
        summary={error ?? summary}
        notes={visibleNotes}
        mode={mode}
        cached={cached}
        busy={busy}
        onMode={(next) => {
          if (next === mode) return;
          setMode(next);
          closePopover();
        }}
        onRefresh={() => void run(true)}
      />

      {explainOnly > 0 && !busy && (
        <div
          style={{
            font: `11px/1.5 'DM Sans',sans-serif`, color: C.faint,
            margin: '-8px 0 14px', paddingLeft: '2px',
          }}
        >
          {explainOnly} more note{explainOnly === 1 ? '' : 's'} in the Explain view.
        </div>
      )}

      {notesHidden > 0 && !busy && (
        <div
          style={{
            font: `11px/1.5 'DM Sans',sans-serif`, color: C.faint,
            margin: '-8px 0 14px', paddingLeft: '2px',
          }}
        >
          {notesHidden} note{notesHidden === 1 ? '' : 's'} hidden by your annotation
          filter (toolbar icon to change).
        </div>
      )}

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

      {createPortal(
        /*
         * Keys typed in the floating UI must die here. They bubble out of the
         * shadow root retargeted to the host <div>, so GitHub's document-level
         * hotkey guard ("ignore events from form fields") does not recognise
         * the chat input — a "." mid-sentence launches github.dev, a "/"
         * steals focus to search, and the reviewer's text is cut off.
         */
        <div
          style={{ display: 'contents' }}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onKeyPress={(e) => e.stopPropagation()}
        >
      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', top: `${open.top}px`, left: `${open.left}px`,
            width: `${POPOVER_WIDTH}px`, zIndex: 2147483000,
            // Long notes exceed any height estimate: cap and scroll rather
            // than run off the bottom of the screen.
            maxHeight: '78vh', overflowY: 'auto', borderRadius: '12px',
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
          activity={activity}
          usage={usage}
          input={input}
          contextChips={[`PR #${pr.number}`, 'diff', `${notes.length} findings`, ...repos.map((r) => `repo:${r}`)]}
          onInput={setInput}
          onSend={() => send(input)}
          onAddRepo={(path) => {
            void chrome.runtime.sendMessage({ type: 'ADD_REPO', path }).then((reply: { ok: boolean; repos?: string[]; error?: string }) => {
              if (reply.ok && reply.repos) setRepos(reply.repos);
              else if (!reply.ok) {
                setMessages((prev) => [...prev, { role: 'assistant', content: `⚠ ${reply.error}` }]);
              }
            });
          }}
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
          <Sparkle size={22} />
        </div>
      )}
        </div>,
        overlayRoot,
      )}
    </div>
  );
}
