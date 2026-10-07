import { Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Note, NoteKind } from '@lowdiff/core';
import type { AnnotateReply, ChatTurn, PrLocation, PublicSettingsReply } from '../shared/messages.js';
import { C } from './theme.js';
import { SummaryCard } from './components/SummaryCard.js';
import { AnnotationDock } from './components/AnnotationDock.js';
import { Sparkle } from './components/Sparkle.js';
import { InlineNote } from './components/InlineNote.js';
import { InlineNotes } from './inline-notes.js';
import type { InlineSlot } from './inline-notes.js';
import { useConversation } from './useConversation.js';
import { ChatPanel } from './components/ChatPanel.js';
import { clearBadges, highlightNote, setActiveBadge, syncBadges, noteKey } from './annotate.js';
import { detectDiffDom } from './dom/index.js';
import { watch } from './watch.js';

interface Props {
  pr: PrLocation;
  /** Container in the document.body-level shadow host for floating UI. */
  overlayRoot: Element;
}

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
/**
 * A scan legitimately runs for minutes, so it gets no deadline — instead,
 * poll for orphaning while it waits. Reloading the extension mid-scan
 * otherwise leaves the card on "Reading the diff…" forever.
 */
function orGetsOrphaned<T>(work: Promise<T>): Promise<T> {
  let settled = false;
  const watchdog = (async (): Promise<never> => {
    for (;;) {
      await new Promise((tick) => setTimeout(tick, 2000));
      if (settled) return new Promise<never>(() => {});
      if (orphaned()) throw new Error(REFRESH_HINT);
    }
  })();
  return Promise.race([
    work.finally(() => {
      settled = true;
    }),
    watchdog,
  ]);
}

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
 * Owns the summary card, line-anchored discussions, and the chat panel.
 *
 * The per-line badges are not rendered here — they are injected into GitHub's
 * own diff rows by `syncBadges`, so the annotations sit on the real diff the
 * reviewer is already reading rather than on a copy of it.
 */
export function Overlay({ pr, overlayRoot }: Props) {
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [hiddenKinds, setHiddenKinds] = useState<NoteKind[]>([]);
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(true);
  const [idle, setIdle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedKeys, setPlacedKeys] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const wasChatOpen = useRef(false);
  const [input, setInput] = useState('');
  const [chatSource, setChatSource] = useState<string | null>(null);
  const chat = useConversation(pr);
  const inlineNotes = useMemo(() => new InlineNotes(), []);
  const [slots, setSlots] = useState<InlineSlot[]>([]);
  const [openRequests, setOpenRequests] = useState<Record<string, number>>({});
  const navKey = useRef<string | null>(null);

  // One scan carries every kind; the popup's kind filter is the one lens
  // over it, so changing it is instant and free.
  const visibleNotes = useMemo(
    () => notes.filter((note) => !hiddenKinds.includes(note.kind)),
    [notes, hiddenKinds],
  );
  const orderedNotes = useMemo(() => {
    const order = new Map(placedKeys.map((key, index) => [key, index]));
    return [...visibleNotes].sort((a, b) =>
      (order.get(noteKey(a)) ?? placedKeys.length) - (order.get(noteKey(b)) ?? placedKeys.length));
  }, [visibleNotes, placedKeys]);

  const select = useCallback((note: Note, element: HTMLElement) => {
    const key = noteKey(note);
    navKey.current = key;
    setActiveKey(key);
    setActiveBadge(element);
    const dom = detectDiffDom();
    if (dom) highlightNote(note, dom);
    setOpenRequests(previous => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
  }, []);

  useEffect(() => () => {
    inlineNotes.clear();
    clearBadges();
    const dom = detectDiffDom();
    if (dom) highlightNote(null, dom);
  }, [inlineNotes]);

  // Reserve space on desktop so chat never sits on top of the diff. On a
  // narrow viewport it becomes a dismissible sheet instead of squeezing code.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@media (min-width: 1000px) {
      body[data-lowdiff-chat-layout] {
        box-sizing: border-box !important;
        transition: padding-right 280ms cubic-bezier(.22,.61,.36,1) !important;
      }
      body[data-lowdiff-chat-open] { padding-right: 400px !important; }
    }
    @media (prefers-reduced-motion: reduce) {
      body[data-lowdiff-chat-layout] { transition: none !important; }
    }`;
    document.head.append(style);
    document.body.setAttribute('data-lowdiff-chat-layout', '');
    return () => {
      style.remove();
      document.body.removeAttribute('data-lowdiff-chat-layout');
      document.body.removeAttribute('data-lowdiff-chat-open');
    };
  }, []);

  useLayoutEffect(() => {
    document.body.toggleAttribute('data-lowdiff-chat-open', chatOpen);
    if (!chatOpen && wasChatOpen.current) {
      overlayRoot.querySelector<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]')?.focus({ preventScroll: true });
    }
    wasChatOpen.current = chatOpen;
  }, [chatOpen, overlayRoot]);

  /**
   * Walk the findings in document order, glowing each visited star. The
   * cursor is the note's identity, not a slot index: the badge list is
   * rebuilt whenever the diff renders more rows or the kind filter changes,
   * so an index would silently point at a different finding afterwards.
   */
  const nav = useCallback(
    (step: number) => {
      const badges = [...document.querySelectorAll<HTMLElement>('[data-lowdiff-badge]')];
      if (badges.length === 0) return;
      const at = badges.findIndex((b) => b.getAttribute('data-lowdiff-key') === navKey.current);
      const next =
        at === -1
          ? step > 0
            ? 0
            : badges.length - 1
          : (at + step + badges.length) % badges.length;
      const badge = badges[next]!;
      badge.scrollIntoView({ block: 'center' });
      badge.click();
    },
    [],
  );

  const jumpTo = useCallback((note: Note) => {
    const key = noteKey(note);
    const badge = [...document.querySelectorAll<HTMLElement>('[data-lowdiff-badge]')]
      .find(element => element.getAttribute('data-lowdiff-key') === key);
    if (!badge) return;
    badge.scrollIntoView({ block: 'center' });
    badge.focus({ preventScroll: true });
    badge.click();
  }, []);

  /** Reconcile against DOM identity: GitHub may replace rows without changing their count. */
  useEffect(() => {
    if (notes.length === 0) {
      clearBadges();
      inlineNotes.clear();
      setSlots([]);
      setPlacedKeys([]);
      navKey.current = null;
      setActiveKey(null);
      const dom = detectDiffDom();
      if (dom) highlightNote(null, dom);
      return;
    }
    let previousCells: HTMLElement[] = [];
    let expectedBadges = -1;
    return watch(() => {
      const dom = detectDiffDom();
      if (!dom) {
        previousCells = [];
        expectedBadges = -1;
        setPlacedKeys(previous => previous.length ? [] : previous);
        return;
      }
      const cells = dom.paths().flatMap(path => dom.lines(path).map(line => line.codeCell));
      const changed = cells.length !== previousCells.length || cells.some((cell, index) => cell !== previousCells[index]) ||
        document.querySelectorAll('[data-lowdiff-badge]').length !== expectedBadges;
      if (changed) {
        previousCells = cells;
        expectedBadges = syncBadges(visibleNotes, dom, ({ note, element }) => select(note, element));
        const badges = [...document.querySelectorAll<HTMLElement>('[data-lowdiff-badge]')];
        setPlacedKeys(badges.map(badge => badge.getAttribute('data-lowdiff-key')!));
        const active = badges.find(badge => badge.getAttribute('data-lowdiff-key') === navKey.current);
        setActiveBadge(active ?? null);
        highlightNote(active ? visibleNotes.find(note => noteKey(note) === navKey.current) ?? null : null, dom);
      }
      const next = inlineNotes.sync(notes, dom, hiddenKinds);
      if (changed) setSlots(next);
    });
  }, [notes, visibleNotes, hiddenKinds, select, inlineNotes]);

  const run = useCallback(
    async (refresh: boolean, onlyCached = false) => {
      if (orphaned()) {
        setBusy(false);
        setError(REFRESH_HINT);
        setNotes([]);
        return;
      }
      setBusy(true);
      // Leave the ask the moment any scan starts — from its Analyze button
      // or from ↻ — or it keeps rendering over the progress and the error,
      // and its still-live button can start a second billed scan.
      setIdle(false);
      setError(null);
      let reply: AnnotateReply;
      try {
        reply = (await orGetsOrphaned(
          chrome.runtime.sendMessage({ type: 'ANNOTATE', pr, refresh, onlyCached }),
        )) as AnnotateReply;
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
      if ('idle' in reply) {
        setIdle(true);
        // Every other terminal path clears the notes; idle must too, or
        // whatever an earlier run put on screen outlives its scan.
        setNotes([]);
        return;
      }
      setIdle(false);
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

      if (reply.ok) setHiddenKinds(reply.settings.hiddenKinds);

      if (reply.ok && !reply.settings.configured) {
        setBusy(false);
        setError('LowDiff needs an API key before it can review this pull request.');
        return;
      }
      // A cached review is free to show; a fresh scan asks first.
      await run(false, true);
    })();
  }, [run]);

  const send = () => { if (chat.conversation.send(input)) setInput(''); };
  const continueInChat = (note: Note, history: ChatTurn[]) => {
    if (chat.busy) return;
    chat.conversation.continueThread(noteKey(note), history);
    setChatSource(`${note.anchor.path}:${note.anchor.line}`);
    setChatOpen(true);
  };

  const notesLost = visibleNotes.length - placedKeys.length;
  const notesHidden = notes.length - visibleNotes.length;

  return (
    <div class="root">
      <SummaryCard
        summary={error ?? summary}
        notes={visibleNotes}
        cached={cached}
        busy={busy}
        onRefresh={() => void run(true)}
        idle={idle}
        onScan={() => void run(false)}
      />

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

      {slots.map(slot => <Fragment key={slot.key}>{createPortal(
        <InlineNote key={slot.key} note={slot.note} pr={pr}
          openRequest={openRequests[slot.key] ?? 0} chatBusy={chat.busy}
          onContinue={continueInChat} />,
        slot.container,
      )}</Fragment>)}

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
      <AnnotationDock notes={orderedNotes} placedKeys={placedKeys} activeKey={activeKey}
        busy={busy} chatOpen={chatOpen} onToggleChat={() => setChatOpen(open => !open)} onNav={nav} onSelect={jumpTo} />
      <ChatPanel
          open={chatOpen}
          messages={chat.messages}
          typing={chat.busy}
          activity={chat.activity}
          usage={chat.usage}
          error={chat.error}
          input={input}
          contextChips={[`PR #${pr.number}`, ...(chatSource ? [chatSource] : ['diff', `${notes.length} findings`])]}
          subtitle={`${pr.repo} · PR #${pr.number}`}
          onInput={setInput}
          onSend={send}
          onClose={() => setChatOpen(false)}
      />
      {!chatOpen && visibleNotes.length === 0 && !busy && (
        <button
          class="chat-launcher"
          type="button"
          onClick={() => setChatOpen(true)}
          title="Ask LowDiff"
          aria-label="Open LowDiff chat"
          style={{
            position: 'fixed', right: '36px', bottom: '36px', zIndex: 2147483000,
            width: '54px', height: '54px', borderRadius: '50%',
            background: C.accent, color: '#fff', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', cursor: 'pointer', boxShadow: '0 8px 24px rgba(91,91,214,.4)',
          }}
        >
          <Sparkle size={22} />
        </button>
      )}
        </div>,
        overlayRoot,
      )}
    </div>
  );
}
