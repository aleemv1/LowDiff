# LowDiff

AI review annotations layered over GitHub pull request diffs. Inline `✦` badges on
changed lines, a PR-level summary, and a chat panel grounded in the diff.

One scan per pull request covers both jobs: problems (risk, security,
breaking — held to a "false alarm costs more than a missed nit" bar, so a
clean PR gets zero problem badges and that's correct) and understanding (the
notes, suggestions, and performance observations that walk someone unfamiliar
with the codebase through the change). The toolbar popup dials how much of
that you see — problems only through everything — instantly, by filtering the
one cached scan rather than paying for another.

Bring your own Anthropic API key. Nothing is hosted, so nobody pays for anyone
else's inference. (OpenAI and Google adapters exist in `packages/providers`
and may return to the extension later; this release ships the path that is
battle-tested.)

## Set up in Chrome

**1. Build and load the extension.**

```bash
npm install && npm run build
```

Open `chrome://extensions`, switch on **Developer mode**, click **Load
unpacked**, and pick `apps/extension/dist`. The options page opens by itself on
first install.

**2. Paste your Anthropic API key** on the options page (the "Create a key"
link goes to the console). Settings save on their own; there is no Save
button to forget.

**3. (Optional) GitHub token**, right below the key. Without one, public
repos work at 60 API requests/hour; a fine-grained read-only token (Contents,
Pull requests, Metadata) raises that to 5,000 and unlocks private repos.

**4. (Optional) Local repo search.** Run `npm run daemon` in this repo and
paste the token it prints into **Advanced**. Chat can then grep and read your
local checkouts while answering, and the card grows a **🔍 deep** button that
re-scans with repository search results included.

Then open any pull request's **Files changed** (or **Changes**) tab.

## What the scan sees

Every scan gets the PR title and description, the diff, and the **full
contents of the changed files** (fetched at the head commit, size-capped) so
the model sees whole functions rather than hunk fragments. A **deep scan**
(the 🔍 button, needs the daemon) additionally greps your local checkouts for
the symbols the diff defines and hands the call sites to the model — "who
uses this code" grounding. Context is strictly read-only: notes may only cite
lines that appear in the diff itself.

## Using it

- **The summary card** sits above the diff: a two-sentence verdict and count
  chips per note kind. `↻` re-runs against the current commit; results are
  cached per head SHA, so revisiting a PR is free.
- **`✦` badges** trail the end of each annotated line, colour-coded by kind.
  Unread badges pulse gently; a badge stops for good once you've opened it.
- **Click a badge** for the note: what's wrong, where (`file:line`), how far to
  trust it ("depends on code not in this diff"), and — when the model has one —
  a block labelled **SUGGESTED FIX** with a Copy button.
- **Chat** (the floating `✦` button, or "Ask about this" in a note) opens a
  panel grounded in the diff and the review. Enter sends, Shift+Enter breaks
  the line. With the daemon connected it searches your local repos too.
- **The toolbar popup** filters which note kinds show: problems only → ⋯ →
  everything.

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

The extension ships Anthropic, API-key only. Subscription sign-in is
restricted by Anthropic to Claude Code and claude.ai, and LowDiff will not
impersonate another application's OAuth client; that gate is each provider's
to open. The OpenAI and Google adapters remain in `packages/providers` for
the CLI and a future release.

## Roadmap

- Firefox, note dismissal, spend caps.

See [docs/DESIGN.md](docs/DESIGN.md) for the decisions behind all of this.

## License

MIT
