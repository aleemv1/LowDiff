# LowDiff

AI review annotations layered over GitHub pull request diffs. Inline `✦` badges on
changed lines, a PR-level summary, and a chat panel grounded in the diff.

Two modes, toggled in the overlay header:

- **Review** — problems only. A clean PR gets zero badges, and that's a correct
  outcome, not a broken one.
- **Explain** — narrates the change for someone unfamiliar with the codebase.

Bring your own key: Anthropic, OpenAI, or Google. Nothing is hosted, so nobody
pays for anyone else's inference.

## Install (development)

```bash
npm install && npm run build
```

Then load `apps/extension/dist` at `chrome://extensions` → Developer mode →
Load unpacked. The options page opens on first install; paste an API key and
open any pull request's **Files changed** tab.

A GitHub token is optional. Without one, public repos work at 60 API
requests/hour; a fine-grained read-only token (Contents, Pull requests,
Metadata) raises that to 5,000 and unlocks private repos.

## Layout

```
packages/core       types, note schema, prompts, diff parsing, anchoring
packages/providers  LlmClient adapters — anthropic | openai | google
packages/context    ContextProvider — GitHub REST today, local daemon later
apps/extension      MV3 extension: service worker + Preact overlay
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

Reviews are cached against the head SHA, so revisiting a PR is free and a new
commit is what invalidates.

## Working on the UI

```bash
npm run build --workspace @lowdiff/extension
npx http-server apps/extension/dist    # or any static server
```

Open `dev.html` for a harness that renders the overlay against fixture data
with `chrome.*` stubbed — no packing or extension reload needed.

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
| OpenAI | ✅ | ⚠️ device-code flow, gated on OpenAI approval |
| Google | ✅ | ✅ |

## Roadmap

- `lowdiff-daemon` — a localhost companion for cross-repo chat over shallow
  clones, which the GitHub code search API is too rate-limited to do well.
- Firefox, note dismissal, spend caps.

See [docs/DESIGN.md](docs/DESIGN.md) for the decisions behind all of this.

## License

MIT
