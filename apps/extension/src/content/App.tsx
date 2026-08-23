import { useCallback, useEffect, useState } from 'preact/hooks';
import type { FileDiff, Mode, Note } from '@lowdiff/core';
import type { AnnotateReply, ChatTurn, PrLocation, PublicSettingsReply } from '../shared/messages.js';
import { C } from './theme.js';
import { SummaryCard } from './components/SummaryCard.js';
import { DiffFileView } from './components/DiffFile.js';
import { ChatPanel } from './components/ChatPanel.js';

interface Props {
  pr: PrLocation;
  files: FileDiff[];
}

export function App({ pr, files }: Props) {
  const [mode, setMode] = useState<Mode>('review');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [cached, setCached] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [openNote, setOpenNote] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');

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
        setNeedsSetup(reply.error.includes('No API key'));
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
        setNeedsSetup(true);
        setError('LowDiff needs an API key before it can review this pull request.');
        return;
      }
      await run(startMode, false);
    })();
  }, [run]);

  const onMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setOpenNote(null);
    void run(next, false);
  };

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
    });
  };

  const askAbout = (note: Note) => {
    setOpenNote(null);
    setChatOpen(true);
    send(`About "${note.title}" at ${note.anchor.path}:${note.anchor.line} — tell me more.`);
  };

  return (
    <div class="root">
      <SummaryCard
        summary={error ?? summary}
        notes={notes}
        mode={mode}
        cached={cached}
        busy={busy}
        onMode={onMode}
        onRefresh={() => void run(mode, true)}
      />

      {needsSetup && (
        <div
          style={{
            border: `1px solid ${C.accentBorder}`, borderRadius: '10px', padding: '14px 16px',
            marginBottom: '18px', background: C.accentTint,
            font: `12.5px/1.6 'DM Sans',sans-serif`, color: C.body,
          }}
        >
          Add an API key in LowDiff's options to start reviewing.{' '}
          <button
            class="btn btn-primary"
            style={{ marginLeft: '6px' }}
            onClick={() => void chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' })}
          >
            Open options
          </button>
        </div>
      )}

      {!needsSetup &&
        files
          .filter((f) => f.hunks.length > 0)
          .map((file) => (
            <DiffFileView
              key={file.path}
              file={file}
              notes={notes}
              openNote={openNote}
              onToggle={(id) => setOpenNote((cur) => (cur === id ? null : id))}
              onAsk={askAbout}
            />
          ))}

      {chatOpen ? (
        <ChatPanel
          messages={messages}
          typing={typing}
          input={input}
          contextChips={[`PR #${pr.number}`, `${files.length} files changed`]}
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
