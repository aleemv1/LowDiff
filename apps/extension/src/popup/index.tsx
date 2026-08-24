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

const KINDS: { kind: NoteKind; label: string; color: string }[] = [
  { kind: 'SECURITY', label: '🔒 Security', color: '#c4362a' },
  { kind: 'RISK', label: '⚠ Risk', color: '#c4362a' },
  { kind: 'BREAKING', label: '⚡ Breaking', color: '#9a6700' },
  { kind: 'PERF', label: 'Perf', color: '#0969da' },
  { kind: 'SUGGESTION', label: 'Suggestion', color: '#1a7f37' },
  { kind: 'EXPLAIN', label: 'Explain', color: '#59636e' },
];

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
  const hasKey = Boolean(settings.keys[settings.provider]);
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
            {!settings.keys[p.id] && ' ⚠'}
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

      <label style={label}>ANNOTATIONS</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        {KINDS.map(({ kind, label: text, color }) => {
          const hidden = (settings.hiddenKinds ?? []).includes(kind);
          return (
            <button
              key={kind}
              title={hidden ? 'Hidden — click to show' : 'Shown — click to hide'}
              onClick={() => {
                const current = settings.hiddenKinds ?? [];
                update({
                  hiddenKinds: hidden ? current.filter((k) => k !== kind) : [...current, kind],
                });
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                cursor: 'pointer',
                font: '600 10.5px inherit',
                border: `1px solid ${hidden ? T.line : color}`,
                background: hidden ? 'transparent' : T.tint,
                color: hidden ? T.muted : color,
                opacity: hidden ? 0.6 : 1,
                textDecoration: hidden ? 'line-through' : 'none',
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
      <p style={{ margin: '6px 0 0', font: '10px/1.5 inherit', color: T.muted }}>
        Hiding a kind filters the overlay instantly — nothing is re-run.
      </p>

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
