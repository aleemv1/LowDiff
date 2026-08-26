/**
 * Toolbar popup: the quick controls — provider, model, mode — with a link to
 * the full options page for keys and tokens. Keys are deliberately not
 * editable here; a popup dismisses on any focus change, which makes it a bad
 * place to paste secrets.
 */
import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ProviderId } from '@lowdiff/providers/types';
import { DEFAULT_MODELS } from '@lowdiff/providers/types';
import type { Mode, NoteKind } from '@lowdiff/core';
import type { Settings } from '../shared/messages.js';
import { DEFAULT_SETTINGS } from '../shared/messages.js';
import { loadSettings, saveSettings } from '../background/storage.js';

const PROVIDERS: { id: ProviderId; label: string; models: string[] }[] = [
  { id: 'anthropic', label: 'Anthropic', models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] },
  { id: 'openai', label: 'OpenAI', models: ['gpt-5.5', 'gpt-5.5-mini'] },
  { id: 'google', label: 'Google', models: ['gemini-3.7-flash', 'gemini-3.7-pro'] },
];

/**
 * One question — how much do you want to hear? — instead of six switches.
 * Each level is exactly the kinds it hides, so it stays a display filter.
 */
const LEVELS: { id: string; title: string; detail: string; hides: NoteKind[] }[] = [
  {
    id: 'problems',
    title: 'Problems only',
    detail: 'Security, risk, breaking',
    hides: ['PERF', 'SUGGESTION', 'EXPLAIN'],
  },
  {
    id: 'perf',
    title: 'Problems + performance',
    detail: 'Adds performance notes',
    hides: ['SUGGESTION', 'EXPLAIN'],
  },
  {
    id: 'all',
    title: 'Everything',
    detail: 'Adds suggestions and explanations',
    hides: [],
  },
];

function levelOf(hidden: NoteKind[]): string {
  const set = new Set(hidden);
  for (const level of LEVELS) {
    if (level.hides.length === set.size && level.hides.every((k) => set.has(k))) return level.id;
  }
  return 'custom'; // a hand-edited hiddenKinds from an older build
}

const T = {
  ink: 'var(--ld-ink, #1f2328)',
  muted: 'var(--ld-muted, #59636e)',
  line: 'var(--ld-line, #d1d9e0)',
  accent: '#5b5bd6',
  tint: 'rgba(91,91,214,.08)',
};

function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  /** Popup changes persist immediately — there is no Save in a popup. */
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveSettings(next);
  };

  const provider = PROVIDERS.find((p) => p.id === settings.provider) ?? PROVIDERS[0]!;
  const connected = (id: string) =>
    Boolean(settings.keys[id as keyof typeof settings.keys]) ||
    (id === 'google' && Boolean(settings.googleAccount)) ||
    (id === 'openai' && Boolean(settings.openaiTokens));
  const hasKey = connected(settings.provider);
  const models = useMemo(() => {
    const list = [...provider.models];
    // A custom model from options stays selectable rather than vanishing.
    if (settings.model && !list.includes(settings.model)) list.unshift(settings.model);
    return list;
  }, [provider, settings.model]);

  const label = {
    display: 'block',
    font: '700 10px inherit',
    letterSpacing: '.05em',
    color: T.muted,
    margin: '12px 0 5px',
  };
  const select = {
    width: '100%',
    padding: '7px 9px',
    borderRadius: '7px',
    border: `1px solid ${T.line}`,
    font: '12.5px inherit',
    color: T.ink,
    background: 'transparent',
  };

  if (!loaded) return null;

  return (
    <div style={{ padding: '14px 16px 16px', color: T.ink }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '22px', height: '22px', borderRadius: '7px', background: T.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
          ✦
        </span>
        <b style={{ fontSize: '13.5px' }}>LowDiff</b>
        {!hasKey && (
          <span style={{ marginLeft: 'auto', font: '600 10px inherit', color: '#c4362a' }}>
            no API key
          </span>
        )}
      </div>

      <label style={label}>PROVIDER</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => update({ provider: p.id, model: undefined })}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '7px',
              cursor: 'pointer',
              font: '600 11.5px inherit',
              border: `1px solid ${settings.provider === p.id ? T.accent : T.line}`,
              background: settings.provider === p.id ? T.tint : 'transparent',
              color: settings.provider === p.id ? T.accent : T.muted,
            }}
          >
            {p.label}
            {!connected(p.id) && ' ⚠'}
          </button>
        ))}
      </div>

      <label style={label}>MODEL</label>
      <select
        style={select}
        value={settings.model ?? DEFAULT_MODELS[settings.provider]}
        onChange={(e) => {
          const value = (e.target as HTMLSelectElement).value;
          update({ model: value === DEFAULT_MODELS[settings.provider] ? undefined : value });
        }}
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
            {m === DEFAULT_MODELS[settings.provider] ? ' (default)' : ''}
          </option>
        ))}
      </select>

      <label style={label}>SHOW</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {LEVELS.map((level) => {
          const active = levelOf(settings.hiddenKinds ?? []) === level.id;
          return (
            <button
              key={level.id}
              onClick={() => update({ hiddenKinds: level.hides })}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '9px',
                padding: '7px 9px',
                border: 'none',
                borderRadius: '8px',
                background: active ? T.tint : 'transparent',
                cursor: 'pointer',
                textAlign: 'left' as const,
              }}
            >
              <span
                style={{
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  border: `1.5px solid ${active ? T.accent : T.line}`,
                  boxShadow: active ? `inset 0 0 0 3.5px ${T.accent}` : 'none',
                  marginTop: '1px',
                  flex: 'none',
                }}
              />
              <span>
                <b style={{ display: 'block', font: '600 12px inherit', color: T.ink }}>
                  {level.title}
                </b>
                <span style={{ font: '10.5px/1.45 inherit', color: T.muted }}>{level.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label style={label}>MODE</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        {(['review', 'explain'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => update({ defaultMode: m })}
            style={{
              flex: 1,
              padding: '7px 0',
              borderRadius: '7px',
              cursor: 'pointer',
              font: '600 11.5px inherit',
              border: `1px solid ${settings.defaultMode === m ? T.accent : T.line}`,
              background: settings.defaultMode === m ? T.tint : 'transparent',
              color: settings.defaultMode === m ? T.accent : T.muted,
            }}
          >
            {m === 'review' ? 'Review' : 'Explain'}
          </button>
        ))}
      </div>

      <button
        onClick={() => void chrome.runtime.openOptionsPage()}
        style={{
          marginTop: '14px',
          width: '100%',
          padding: '8px 0',
          borderRadius: '7px',
          border: 'none',
          cursor: 'pointer',
          background: T.accent,
          color: '#fff',
          font: '600 12px inherit',
        }}
      >
        API keys & advanced settings
      </button>
      <p style={{ margin: '8px 0 0', font: '10.5px/1.5 inherit', color: T.muted }}>
        Changes apply to the next review — hit ↻ on an open PR to re-run.
      </p>
    </div>
  );
}

render(<Popup />, document.getElementById('root')!);
