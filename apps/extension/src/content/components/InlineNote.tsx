import type { Note } from '@lowdiff/core';
import type { ChatTurn, PrLocation } from '../../shared/messages.js';
import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import { C, KIND_STYLE } from '../theme.js';
import { useConversation } from '../useConversation.js';
import { Sparkle } from './Sparkle.js';
import { Markdown } from './Markdown.js';
import { CodeBlock } from './CodeBlock.js';

interface Props {
  note: Note;
  pr: PrLocation;
  openRequest: number;
  chatBusy: boolean;
  onContinue: (note: Note, history: ChatTurn[]) => void;
}

export function InlineNote({ note, pr, openRequest, chatBusy, onContinue }: Props) {
  const [expanded, setExpanded] = useState(note.kind === 'RISK' || note.kind === 'SECURITY');
  const [showFix, setShowFix] = useState(false);
  const [input, setInput] = useState('');
  const detailId = useId();
  const source = `${note.anchor.path}:${note.anchor.line}${note.anchor.endLine ? `–${note.anchor.endLine}` : ''}`;
  const seed = useMemo<ChatTurn[]>(() => [
    { role: 'user', content: `Discuss the ${note.kind.toLowerCase()} finding "${note.title}" at ${source} (${note.anchor.side.toLowerCase()} side).` },
    { role: 'assistant', content: `${note.body}${note.code ? `\n\nSuggested fix:\n\`\`\`\n${note.code}\n\`\`\`` : ''}` },
  ], [source, note.kind, note.title, note.anchor.side, note.body, note.code]);
  const chat = useConversation(pr, seed);
  const kind = KIND_STYLE[note.kind]!;

  useEffect(() => { if (openRequest > 0) setExpanded(true); }, [openRequest]);
  const send = () => { if (chat.conversation.send(input)) setInput(''); };

  return (
    <section class="inline-note" aria-label={`${note.kind}: ${note.title}`}
      onKeyDown={e => e.stopPropagation()} onKeyUp={e => e.stopPropagation()} onKeyPress={e => e.stopPropagation()}>
      <header class="inline-note-header">
        <span style={{ color: C.accentDark, display: 'flex' }}><Sparkle size={16} /></span>
        <strong>LowDiff</strong>
        <span class="pill" style={{ background: kind.headBg, color: kind.color }}>{note.kind}</span>
        <span class="inline-source" title={source}>{source}</span>
        <button class="btn btn-ghost" aria-expanded={expanded} aria-controls={detailId}
          onClick={() => setExpanded(value => !value)}>{expanded ? 'Collapse ▴' : 'Expand ▾'}</button>
      </header>
      <div class="inline-note-title">{note.title}</div>
      {note.confidence === 'medium' && <div class="inline-caveat">Depends on code outside this diff</div>}
      {expanded && <div id={detailId}>
        <div class="inline-note-body">
          <Markdown text={note.body} font="13px/1.6 inherit" />
          {note.code && <>
            <button class="inline-link" aria-expanded={showFix} onClick={() => setShowFix(value => !value)}>
              {showFix ? '▾ Hide suggested fix' : '› Show suggested fix'}
            </button>
            {showFix && <CodeBlock code={note.code} lang={note.anchor.path.split('.').pop() ?? ''} role="SUGGESTED FIX" />}
          </>}
        </div>
        <div aria-live="polite" aria-relevant="additions text">
          {chat.messages.map((message, index) => <div class="inline-message" key={index}>
            <strong>{message.role === 'user' ? 'You' : 'LowDiff'}</strong>
            <Markdown text={message.content} font="13px/1.6 inherit" />
          </div>)}
          {chat.busy && <div class="inline-status" role="status">{chat.activity ?? 'Responding…'}</div>}
          {chat.error && <div class="inline-status" role="alert">{chat.error}</div>}
        </div>
        <form class="inline-composer" onSubmit={e => { e.preventDefault(); send(); }}>
          <textarea aria-label="Ask a follow-up about this finding" placeholder="Ask a follow-up…" rows={1} value={input}
            onInput={e => setInput(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
            }} />
          <button class="btn btn-primary" type="submit" aria-label="Send follow-up" disabled={chat.busy || !input.trim()}>↑</button>
        </form>
        <footer class="inline-note-footer">
          <button class="inline-link" disabled={chat.busy || chatBusy}
            title={chat.busy || chatBusy ? 'Wait for the current answer to finish' : 'Continue this discussion in the right sidebar'}
            onClick={() => onContinue(note, chat.conversation.history)}>Continue in chat →</button>
        </footer>
      </div>}
    </section>
  );
}
