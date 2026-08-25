import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProviderId } from '@lowdiff/providers/types';
import { DEFAULT_MODELS } from '@lowdiff/providers/types';
import type { Mode } from '@lowdiff/core';
import type { Settings } from '../shared/messages.js';
import { DEFAULT_SETTINGS } from '../shared/messages.js';
import { loadSettings, saveSettings } from '../background/storage.js';
import { C, STYLES } from '../content/theme.js';

// The C tokens are var(--ld-*) references declared under :host for the shadow
// -rooted overlay. This is a plain document, so re-scope them to :root — as
// the dev playground does — or every border and background using them is
// silently discarded and the page renders as bare text.
const tokens = document.createElement('style');
tokens.textContent = STYLES.replaceAll(':host', ':root');
document.head.append(tokens);

// This page opens on install, so it is the landing: pitch beside the form,
// growing with the window up to a readable cap, centred both ways, and
// stacking on narrow windows.
const layout = document.createElement('style');
layout.textContent = `
  .opt-grid {
    display: grid; grid-template-columns: 5fr 6fr;
    gap: clamp(40px, 6vw, 96px);
    max-width: 1160px; margin: 0 auto; box-sizing: border-box;
    align-items: start; align-content: center; min-height: 100vh;
    padding: 48px 24px 80px;
  }
  @media (max-width: 940px) {
    .opt-grid { grid-template-columns: minmax(0, 520px); justify-content: center; min-height: 0; }
  }

  @keyframes opt-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .rise { animation: opt-rise .55s cubic-bezier(.2,.7,.3,1) both; }
  @keyframes opt-twinkle {
    0%, 100% { transform: none; }
    50% { transform: rotate(12deg) scale(1.12); }
  }
  .twinkle { display: inline-block; animation: opt-twinkle 3.2s ease-in-out 1s infinite; }
  @media (prefers-reduced-motion: reduce) { .rise, .twinkle { animation: none; } }
`;
document.head.append(layout);

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

const STEPS: { title: string; detail: string }[] = [
  { title: 'Pick a provider', detail: 'Anthropic, OpenAI, or Google' },
  { title: 'Paste an API key', detail: 'Created in your provider console — one click away' },
  { title: 'Open any pull request', detail: 'The review card and ✦ badges appear on the diff' },
];

function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  // Persist shortly after the last change. A Save button is one more thing
  // standing between install and a working review — and, forgotten, it
  // silently discards everything typed.
  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void saveSettings(next).then(() => {
          setSaved(true);
          clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setSaved(false), 1800);
        });
      }, 500);
      return next;
    });
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
  const help = { font: `11.5px/1.55 'DM Sans',sans-serif`, color: C.faint, margin: '7px 0 0' };
  const segButton = (on: boolean) => ({
    flex: 1, padding: '9px', borderRadius: '8px', cursor: 'pointer',
    font: `600 12px 'DM Sans',sans-serif`,
    border: `1px solid ${on ? C.accent : C.line}`,
    background: on ? C.accentTint : '#fff',
    color: on ? C.accentDark : C.muted,
  });

  return (
    <div class="opt-grid">
      {saved && (
        <span
          style={{
            position: 'fixed', top: '18px', right: '22px', background: '#e9f8ec',
            color: '#1a7f37', borderRadius: '999px', padding: '5px 12px',
            font: `600 11.5px 'DM Sans',sans-serif`,
          }}
        >
          ✓ Saved
        </span>
      )}

      <div>
        <span class="rise" style={{ width: '30px', height: '30px', borderRadius: '9px', background: C.accent, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
          <span class="twinkle">✦</span>
        </span>
        <h1
          class="rise"
          style={{
            font: `700 clamp(26px, 2.3vw, 33px)/1.25 'DM Sans',sans-serif`,
            color: C.ink, margin: '12px 0 8px', animationDelay: '.06s',
          }}
        >
          Review annotations,
          <br />
          on the diff itself.
        </h1>
        <p
          class="rise"
          style={{ font: `14px/1.6 'DM Sans',sans-serif`, color: C.muted, margin: '0 0 22px', animationDelay: '.12s' }}
        >
          LowDiff layers AI findings over GitHub pull requests. Keys stay in this browser and
          are sent only to the provider you pick.
        </p>
        {STEPS.map((step, i) => (
          <div
            key={step.title}
            class="rise"
            style={{ display: 'flex', gap: '12px', margin: '14px 0', animationDelay: `${0.18 + i * 0.08}s` }}
          >
            <b
              style={{
                width: '22px', height: '22px', borderRadius: '50%', flex: 'none',
                background: C.accentTint, color: C.accentDark,
                font: `700 11px 'DM Sans',sans-serif`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                transform: 'translateY(1px)',
              }}
            >
              {i + 1}
            </b>
            <div style={{ font: `13px/1.5 'DM Sans',sans-serif`, color: C.ink }}>
              {step.title}
              <span style={{ display: 'block', color: C.faint, fontSize: '11.5px' }}>
                {step.detail}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        class="rise"
        style={{
          background: '#fff', borderRadius: '12px', border: `1px solid ${C.line}`,
          padding: '6px 22px 20px', animationDelay: '.12s',
        }}
      >
        <label style={label}>MODEL PROVIDER</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {PROVIDERS.map((p) => (
            <button key={p.id} onClick={() => update({ provider: p.id })} style={segButton(settings.provider === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <p style={help}>{active.note}</p>

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

        <label style={label}>DEFAULT MODE</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['review', 'explain'] as Mode[]).map((m) => (
            <button key={m} onClick={() => update({ defaultMode: m })} style={segButton(settings.defaultMode === m)}>
              {m === 'review' ? 'Review — problems only' : 'Explain — narrate the change'}
            </button>
          ))}
        </div>

        <div
          onClick={() => setAdvanced(!advanced)}
          style={{
            marginTop: '20px', borderTop: `1px dashed ${C.line}`, paddingTop: '12px',
            font: `600 12px 'DM Sans',sans-serif`, color: C.muted, cursor: 'pointer',
          }}
        >
          {advanced ? '▾' : '▸'} Advanced — model override, GitHub token, local repo search
        </div>

        {advanced && (
          <div>
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
            <p style={help}>
              Fine-grained token, read-only on Contents, Pull requests, and Metadata. Without
              one, public repos work at 60 requests/hour instead of 5,000.
            </p>

            <label style={label}>DAEMON TOKEN (OPTIONAL)</label>
            <input
              type="password"
              value={settings.daemonToken ?? ''}
              placeholder="Lets chat search your local repos"
              onInput={(e) => update({ daemonToken: (e.target as HTMLInputElement).value || undefined })}
              style={field}
            />
            <p style={help}>
              Run <code>npm run daemon</code> in the LowDiff repo and paste the token it prints.
              Without it, chat sees only the pull request.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

render(<Options />, document.getElementById('root')!);
