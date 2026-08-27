# LowDiff

AI review annotations layered over GitHub pull request diffs. Inline `✦` badges on
changed lines, a PR-level summary, and a chat panel grounded in the diff.

One scan per pull request, two views of it, toggled in the overlay header:

- **Review** — problems only: risk, security, breaking. A clean PR gets zero
  badges, and that's a correct outcome, not a broken one.
- **Explain** — adds the notes, suggestions, and performance observations that
  walk someone unfamiliar with the codebase through the change.

Switching views is instant — it filters the one cached scan rather than paying
for another.

Bring your own credentials: an API key for Anthropic, OpenAI, or Google — or a
connected Google account with no key at all. Nothing is hosted, so nobody pays
for anyone else's inference.

## Set up in Chrome

**1. Build and load the extension.**

```bash
npm install && npm run build
```

Open `chrome://extensions`, switch on **Developer mode**, click **Load
unpacked**, and pick `apps/extension/dist`. The options page opens by itself on
first install.

**2. Connect a model provider.** Either:

- **Paste an API key** — pick Anthropic, OpenAI, or Google on the options page
  and paste a key (the "Create a key" link goes to the right console). Settings
  save on their own; there is no Save button to forget.
- **Or connect a Google account (no key).** One-time setup, because Google's
  OAuth client is yours, not ours:
  1. In [Google Cloud console](https://console.cloud.google.com/apis/credentials),
     create an OAuth client of type **Chrome Extension**, using your extension's
     ID from `chrome://extensions`.
  2. Put the client id in `apps/extension/manifest.json` under
     `oauth2.client_id`, rebuild, and reload the extension.
  3. Options → Google → **Connect Google account**. Tokens are minted per call
     by Chrome against your signed-in profile; LowDiff never stores one.

**3. (Optional) GitHub token.** Without one, public repos work at 60 API
requests/hour; a fine-grained read-only token (Contents, Pull requests,
Metadata) raises that to 5,000 and unlocks private repos. Paste it under
**Advanced** on the options page.

**4. (Optional) Local repo search for chat.** Run `npm run daemon` in this repo
and paste the token it prints into **Advanced**. Chat can then grep and read
your local checkouts while answering; without it, chat sees only the pull
request.

Then open any pull request's **Files changed** (or **Changes**) tab.

## Using it

- **The summary card** sits above the diff: a two-sentence verdict, count chips
  per note kind, and the Review/Explain toggle. `↻` re-runs against the current
  commit; results are cached per head SHA, so revisiting a PR is free.
- **`✦` badges** mark annotated lines, colour-coded by kind, aligned in the
  gutter. Unread badges pulse gently; a badge stops for good once you've opened
  it.
- **Click a badge** for the note: what's wrong, where (`file:line`), how far to
  trust it ("depends on code not in this diff"), and — when the model has one —
  a block labelled **SUGGESTED FIX** with a Copy button.
- **Chat** (the floating `✦` button, or "Ask about this" in a note) opens a
  panel grounded in the diff and the review. Enter sends, Shift+Enter breaks
  the line. With the daemon connected it searches your local repos too.
- **The toolbar popup** filters which note kinds show (problems only → ⋯ →
  everything) and sets the default view.

## Layout

```
packages/core       types, note schema, prompts, diff parsing, anchoring
packages/providers  LlmClient adapters — anthropic | openai | google
packages/context    ContextProvider — GitHub REST, plus the local daemon client
apps/extension      MV3 extension: service worker + Preact overlay
apps/daemon         localhost companion: repo search for chat
apps/cli            one-shot review of a PR URL from the terminal
```

`core` has no network or DOM dependency. The whole test suite runs in plain
Node with no browser, no mocks, and no API keys — that property is what keeps
the interesting logic testable, so it's worth defending.

## How notes stay honest

The model returns notes citing a path, side, and line. Before anything renders,
`anchorNotes` checks each citation against the diff the model was actually
shown and **drops** any note pointing at a line that isn't there. A note on the
wrong line reads as a hallucination even when the finding is correct, so a
missing note beats a misplaced one.

Each surviving note stores a hash of its anchored line. When a PR gets new
commits, `reanchor` matches on that hash rather than the line number, so notes
follow their code across a force-push and are dropped if the line is gone.

## Working on the UI

```bash
npm run build --workspace @lowdiff/extension
npx http-server apps/extension/dist    # or any static server
```

Open `dev.html` for a harness that renders the overlay against fixture data
with `chrome.*` stubbed — no packing or extension reload needed. The
`apps/extension/e2e/*.mjs` scripts drive the real built extension in a headed
Chromium against live GitHub and a saved copy of the client-rendered view.

## Security notes

- Keys live in `chrome.storage.local`, never `chrome.storage.sync` — sync would
  replicate them through Google's servers to every signed-in browser.
- Only the service worker touches credentials. The content script shares an
  origin with github.com, so anything reachable there is reachable by any
  script GitHub loads.
- Diffs come from the REST API, not scraped from the DOM. GitHub reships that
  markup regularly; a scraper breaks on their schedule.

## Provider auth

| Provider | API key | Account sign-in |
|---|---|---|
| Anthropic | ✅ | ❌ — subscription OAuth is restricted to Claude Code and claude.ai |
| OpenAI | ✅ | ⚠️ device-code flow implemented, but gated on an OpenAI-approved client id (set under Advanced) |
| Google | ✅ | ✅ — see the setup steps above |

LowDiff will not impersonate another application's OAuth client to reach a
provider's subscription plans; that gate is each provider's to open.

## Roadmap

- Firefox, note dismissal, spend caps.

See [docs/DESIGN.md](docs/DESIGN.md) for the decisions behind all of this.

## License

MIT
