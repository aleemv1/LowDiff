# LowDiff — Design

AI review annotations layered over a GitHub PR diff, as a browser extension.

## Decisions

| Question | Decision |
|---|---|
| Surface | Chrome MV3 extension. Optional local daemon in v2. |
| v1 scope | Inline annotations + summary card + chat scoped to this PR/repo. |
| Posture | Two modes, user-toggled: **Review** (sparse, problems only) / **Explain** (generous narration). |
| Backends | Anthropic, OpenAI, Google — behind one `LlmClient`. |
| Auth | API keys for all three. Google OAuth (Vertex/ADC). OpenAI device-code if approved. Anthropic key-only — subscription OAuth is banned by their Feb 2026 policy. |
| Cross-repo chat | v2, via the local daemon. |

## Packages

```
packages/core       pure: types, note schema, prompts, anchoring, verifier. no I/O.
packages/providers  LlmClient adapters: anthropic | openai | google
packages/context    ContextProvider: GitHubApi (v1) | LocalIndex (v2)
apps/extension      MV3. worker orchestrates + holds creds; content script renders.
```

`core` has no network or DOM dependency, so the whole eval suite runs in Node with
no browser, no mocks, and no keys. Everything else is replaceable around it.

## Interfaces

```ts
interface LlmClient {
  annotate(req: AnnotateRequest): Promise<Note[]>    // schema-enforced
  chat(req: ChatRequest): AsyncIterable<ChatDelta>   // streamed
}

interface ContextProvider {
  getDiff(pr: PrRef): Promise<FileDiff[]>
  searchCode(query: string, repos: RepoRef[]): Promise<CodeHit[]>
  getFile(repo: RepoRef, path: string, ref: string): Promise<string>
}

type Auth =
  | { kind: 'apiKey'; key: string }
  | { kind: 'oauth'; accessToken: string; refreshToken: string; expiresAt: number }
```

## Note contract

Notes are the product. Every note is line-anchored and schema-validated; a note
that fails validation is dropped, never rendered.

```ts
type NoteKind = 'RISK' | 'SECURITY' | 'BREAKING' | 'PERF' | 'EXPLAIN' | 'SUGGESTION'

interface Note {
  kind: NoteKind
  title: string          // <= 60 chars
  body: string           // <= 600 chars
  code?: string          // optional suggested fix
  anchor: Anchor
  confidence: 'high' | 'medium'
}

interface Anchor {
  path: string
  side: 'LEFT' | 'RIGHT'
  line: number
  lineHash: string       // hash of the anchored line's text, for re-anchoring
}
```

`lineHash` is what survives a force-push: on a new head SHA, re-anchor by matching
the hash against the new diff before falling back to line number. Notes that
re-anchor to nothing are dropped rather than shown against the wrong line.

## Rendering

Preact in a Shadow DOM, mounted on GitHub's Files-changed tab. Shadow DOM is
required — GitHub's stylesheet would otherwise reach into the overlay.

## Security

- Keys and OAuth tokens live in the service worker via `chrome.storage.local`.
  Never `storage.sync` (which would replicate them through Google's servers), and
  never reachable from the content script, which shares an origin with github.com.
- Diffs are fetched from the REST API, not scraped from the DOM.
- Results cached in IndexedDB keyed on `(repo, pr, headSha, mode)`.

## v2

- `lowdiff-daemon` — localhost. Cross-repo search over shallow clones, and
  optional credential reuse from `~/.claude` / `~/.codex` (opt-in, ToS warning).
- Firefox, note dismissal, spend caps.
