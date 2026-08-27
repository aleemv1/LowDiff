import { useEffect, useRef } from 'preact/hooks';
import { C } from '../theme.js';
import { Markdown } from './Markdown.js';
import { Sparkle } from './Sparkle.js';
import type { ChatTurn } from '../../shared/messages.js';

interface Props {
  messages: ChatTurn[];
  typing: boolean;
  /** Live tool activity, e.g. 'searching "useDebounce"'. */
  activity: string | null;
  /** Cost line for the last answer, or null before the first. */
  usage: string | null;
  input: string;
  contextChips: string[];
  onInput: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}

export function ChatPanel(props: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Opening the chat is a statement of intent: the next keystrokes belong in
  // this input. Unfocused, they fall through to the page — where they read as
  // GitHub hotkeys — and "typing does nothing" is the symptom.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Collapse back to one row once the question is sent.
  useEffect(() => {
    if (props.input === '' && inputRef.current) inputRef.current.style.height = 'auto';
  }, [props.input]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [props.messages, props.typing]);

  return (
    <div
      onClick={(e) => {
        // Coming back to the panel means coming back to the conversation:
        // route stray clicks to the input, but never over a control click or
        // a text selection in the transcript.
        const target = e.target;
        if (target instanceof HTMLElement && target.closest('button, a, input, textarea')) return;
        // window.getSelection() cannot see into a shadow root — it reports
        // collapsed, so finishing a highlight refocused the input and Chrome
        // wiped the selection. Ask the shadow root itself.
        const rootNode = target instanceof Node ? target.getRootNode() : null;
        const selection =
          rootNode instanceof ShadowRoot && 'getSelection' in rootNode
            ? (rootNode as ShadowRoot & { getSelection(): Selection | null }).getSelection()
            : window.getSelection();
        if (selection && !selection.isCollapsed) return;
        inputRef.current?.focus();
      }}
      style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 2147483000, width: '400px',
        display: 'flex', flexDirection: 'column', background: C.surface,
        boxShadow: '-8px 0 32px rgba(20,30,60,.14)', animation: 'chatUp .18s ease-out',
        borderLeft: `1px solid ${C.line}`,
        fontFamily: `'DM Sans', -apple-system, sans-serif`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', borderBottom: `1px solid ${C.page}` }}>
        <span style={{ width: '20px', height: '20px', borderRadius: '6px', background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>
          <Sparkle size={11} />
        </span>
        <span style={{ font: `700 12px 'DM Sans',sans-serif`, color: C.ink }}>Chat</span>
        <span onClick={props.onClose} style={{ marginLeft: 'auto', cursor: 'pointer', color: C.faint, fontSize: '12px', padding: '2px 6px' }}>
          ✕
        </span>
      </div>

      <div
        ref={scrollRef}
        class="scroll"
        style={{ flex: 1, padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        {props.messages.map((msg, i) => (
          <div
            key={i}
            style={
              msg.role === 'user'
                ? {
                    width: '100%',
                    background: C.accentTint,
                    border: `1px solid ${C.accentBorder}`,
                    padding: '9px 12px',
                    borderRadius: '8px',
                    color: C.ink,
                  }
                : { width: '100%', padding: '0 2px', color: C.body }
            }
          >
            <Markdown text={msg.content} font="12.5px/1.6 inherit" />
          </div>
        ))}
        {props.typing && (
          <div style={{ font: `11.5px 'DM Sans',sans-serif`, color: C.faint }}>
            ✦ {props.activity ?? 'thinking…'}
          </div>
        )}
        {props.usage && !props.typing && (
          <div style={{ font: `10.5px 'DM Sans',sans-serif`, color: C.faint }}>{props.usage}</div>
        )}
      </div>

      <div style={{ padding: '10px 14px 14px' }}>
        <div style={{ border: `1px solid ${C.accentBorder}`, borderRadius: '10px', boxShadow: '0 1px 3px rgba(20,30,60,.05)' }}>
          <div style={{ display: 'flex', gap: '6px', padding: '8px 10px 0', flexWrap: 'wrap', alignItems: 'center' }}>
            {props.contextChips.map((chip) => (
              <span
                key={chip}
                class="mono"
                style={{ background: C.accentTint, color: C.accentDark, borderRadius: '5px', padding: '2px 8px', font: '600 10px ui-monospace,Menlo,monospace' }}
              >
                @ {chip}
              </span>
            ))}
          </div>

          <textarea
            ref={inputRef}
            rows={1}
            value={props.input}
            placeholder="Ask anything about this PR…"
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              // Grow with the question, up to a few lines, then scroll.
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              props.onInput(el.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                props.onSend();
              }
            }}
            style={{
              width: '100%', border: 'none', padding: '10px 12px 6px',
              font: `12.5px/1.5 'DM Sans',sans-serif`, background: 'transparent',
              outline: 'none', color: C.ink, resize: 'none',
              maxHeight: '120px', overflowY: 'auto',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px 8px' }}>
            <span style={{ marginLeft: 'auto', color: C.faint, font: `500 10.5px 'DM Sans',sans-serif` }}>
              ↵ to send
            </span>
            <span
              onClick={props.onSend}
              style={{
                width: '26px', height: '26px', borderRadius: '7px', background: C.accent,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              ↑
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
