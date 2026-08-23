import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ProviderId } from '@lowdiff/providers/types';
import { DEFAULT_MODELS } from '@lowdiff/providers/types';
import type { Mode } from '@lowdiff/core';
import type { Settings } from '../shared/messages.js';
import { DEFAULT_SETTINGS } from '../shared/messages.js';
import { loadSettings, saveSettings } from '../background/storage.js';
import { C } from '../content/theme.js';

const PROVIDERS: { id: ProviderId; label: string; keyUrl: string; note: string }[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'API key only — Anthropic restricts subscription sign-in to Claude Code and claude.ai.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'API key. Account sign-in is gated on OpenAI approving third-party device-code access.',
  },
  {
    id: 'google',
    label: 'Google',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'API key, or connect a Google account (the one provider with a usable OAuth path).',
  },
];

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    await saveSettings(settings);
    setSaved(true);
  };

  const active = PROVIDERS.find((p) => p.id === settings.provider)!;

  const field = {
    width: '100%', padding: '9px 11px', borderRadius: '8px',
    border: `1px solid ${C.line}`, font: `12.5px 'DM Sans',sans-serif`,
    color: C.ink, background: '#fff', boxSizing: 'border-box' as const,
  };
  const label = {
    display: 'block', font: `700 11px 'DM Sans',sans-serif`,
    color: C.muted, margin: '18px 0 6px', letterSpacing: '.03em',
  };

  return (
    <div style={{ maxWidth: '620px', margin: '32px auto', padding: '0 20px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ width: '30px', height: '30px', borderRadius: '9px', background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
          ✦
        </span>
        <h1 style={{ font: `700 20px 'DM Sans',sans-serif`, color: C.ink, margin: 0 }}>LowDiff</h1>
      </div>
      <p style={{ font: `13px/1.6 'DM Sans',sans-serif`, color: C.muted, margin: '0 0 8px' }}>
        AI review annotations on GitHub pull requests. Your keys stay in this browser and are
        sent only to the provider you pick.
      </p>

      <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${C.line}`, padding: '4px 22px 24px' }}>
        <label style={label}>MODEL PROVIDER</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ provider: p.id })}
              style={{
                flex: 1, padding: '9px', borderRadius: '8px', cursor: 'pointer',
                font: `600 12px 'DM Sans',sans-serif`,
                border: `1px solid ${settings.provider === p.id ? C.accent : C.line}`,
                background: settings.provider === p.id ? C.accentTint : '#fff',
                color: settings.provider === p.id ? C.accentDark : C.muted,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p style={{ font: `11.5px/1.55 'DM Sans',sans-serif`, color: C.faint, margin: '8px 0 0' }}>
          {active.note}
        </p>

        <label style={label}>{active.label.toUpperCase()} API KEY</label>
        <input
          type="password"
          value={settings.keys[settings.provider] ?? ''}
          placeholder="Paste your key"
          onInput={(e) =>
            update({
              keys: { ...settings.keys, [settings.provider]: (e.target as HTMLInputElement).value },
            })
          }
          style={field}
        />
        <a
          href={active.keyUrl}
          target="_blank"
          rel="noreferrer"
          style={{ font: `600 11.5px 'DM Sans',sans-serif`, color: C.accentDark, display: 'inline-block', marginTop: '7px' }}
        >
          Create a key on {active.label} ↗
        </a>

        <label style={label}>MODEL (OPTIONAL)</label>
        <input
          value={settings.model ?? ''}
          placeholder={DEFAULT_MODELS[settings.provider]}
          onInput={(e) => update({ model: (e.target as HTMLInputElement).value || undefined })}
          style={field}
        />

        <label style={label}>GITHUB TOKEN (OPTIONAL)</label>
        <input
          type="password"
          value={settings.githubToken ?? ''}
          placeholder="Needed for private repos and a higher rate limit"
          onInput={(e) => update({ githubToken: (e.target as HTMLInputElement).value || undefined })}
          style={field}
        />
        <p style={{ font: `11.5px/1.55 'DM Sans',sans-serif`, color: C.faint, margin: '7px 0 0' }}>
          Fine-grained token, read-only on Contents, Pull requests, and Metadata. Without one,
          public repos work at 60 requests/hour instead of 5,000.
        </p>

        <label style={label}>DEFAULT MODE</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['review', 'explain'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => update({ defaultMode: m })}
              style={{
                flex: 1, padding: '9px', borderRadius: '8px', cursor: 'pointer',
                font: `600 12px 'DM Sans',sans-serif`,
                border: `1px solid ${settings.defaultMode === m ? C.accent : C.line}`,
                background: settings.defaultMode === m ? C.accentTint : '#fff',
                color: settings.defaultMode === m ? C.accentDark : C.muted,
              }}
            >
              {m === 'review' ? 'Review — problems only' : 'Explain — narrate the change'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={() => void save()}
            style={{
              background: C.accent, color: '#fff', border: 'none', borderRadius: '999px',
              padding: '9px 22px', font: `600 12.5px 'DM Sans',sans-serif`, cursor: 'pointer',
            }}
          >
            Save
          </button>
          {saved && (
            <span style={{ font: `600 12px 'DM Sans',sans-serif`, color: '#1a7f37' }}>Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}

render(<Options />, document.getElementById('root')!);
