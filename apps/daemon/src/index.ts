#!/usr/bin/env tsx
/**
 * lowdiff-daemon — localhost companion that lets chat search local repos.
 *
 * Listens on 127.0.0.1 only. Every request needs the bearer token printed at
 * startup, and browser requests are additionally restricted to extension
 * origins — a web page can reach localhost, and must get nothing.
 */
import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  SEARCH_CAPS,
  capMatches,
  containedPath,
  grepArgs,
  originAllowed,
  rgArgs,
  tokenMatches,
  truncateLine,
} from './lib.js';
import type { RepoRegistry } from './lib.js';

const PORT = 7749;
const CONFIG_DIR = join(homedir(), '.lowdiff');
const TOKEN_FILE = join(CONFIG_DIR, 'token');
const REPOS_FILE = join(CONFIG_DIR, 'repos.json');
const MAX_READ_LINES = 160;

mkdirSync(CONFIG_DIR, { recursive: true });

function loadToken(): string {
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, 'utf8').trim();
  const token = randomBytes(24).toString('hex');
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

function loadRepos(): RepoRegistry {
  try {
    return JSON.parse(readFileSync(REPOS_FILE, 'utf8')) as RepoRegistry;
  } catch {
    return {};
  }
}

function saveRepos(repos: RepoRegistry): void {
  writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2));
}

const token = loadToken();
let repos = loadRepos();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    // Let the extension read responses; pages are already refused above this.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Pick the search binary once at startup. `rg` is frequently a shell alias or
 * function rather than a binary, which child_process cannot see — silently
 * treating that launch failure as "no matches" made every search empty.
 */
function detectSearcher(): { cmd: string; args: (query: string) => string[] } {
  try {
    execFileSync('rg', ['--version'], { stdio: 'ignore' });
    return { cmd: 'rg', args: (q) => rgArgs(q, SEARCH_CAPS) };
  } catch {
    return { cmd: 'grep', args: (q) => grepArgs(q, SEARCH_CAPS) };
  }
}
const searcher = detectSearcher();

function runSearch(query: string, roots: string[]): Promise<string[]> {
  return new Promise((done, fail) => {
    execFile(
      searcher.cmd,
      [...searcher.args(query), ...roots],
      { timeout: 10_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        // Exit 1 with empty output means "no matches" — a result. Anything
        // else (ENOENT, exit 2) is a real failure and must say so.
        if (error && !stdout) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') return fail(new Error(`${searcher.cmd} is not installed`));
          if ((error as { code?: number | string }).code === 2) return fail(new Error('search failed'));
        }
        done(
          stdout
            ? stdout.trimEnd().split('\n').map((line) => truncateLine(line, SEARCH_CAPS))
            : [],
        );
      },
    );
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (!originAllowed(req.headers.origin)) {
    return json(res, 403, { error: 'browser pages may not call this daemon' });
  }
  const presented = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!tokenMatches(presented, token)) {
    return json(res, 401, { error: 'missing or wrong token' });
  }

  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, repos: Object.keys(repos) });
  }

  if (req.method === 'GET' && url.pathname === '/repos') {
    return json(res, 200, { repos });
  }

  if (req.method === 'POST' && url.pathname === '/repos') {
    const body = await readBody(req);
    const path = typeof body['path'] === 'string' ? resolve(body['path']) : null;
    if (!path || !existsSync(path) || !statSync(path).isDirectory()) {
      return json(res, 400, { error: 'path must be an existing directory' });
    }
    const name = typeof body['name'] === 'string' && body['name'] ? body['name'] : basename(path);
    repos = { ...repos, [name]: path };
    saveRepos(repos);
    return json(res, 200, { added: name, path });
  }

  if (req.method === 'POST' && url.pathname === '/search') {
    const body = await readBody(req);
    const query = typeof body['query'] === 'string' ? body['query'] : '';
    if (!query.trim()) return json(res, 400, { error: 'query required' });

    const scope =
      typeof body['repo'] === 'string' && repos[body['repo']]
        ? { [body['repo'] as string]: repos[body['repo'] as string]! }
        : repos;
    const roots = Object.values(scope);
    if (roots.length === 0) return json(res, 200, { matches: [] });

    let lines: string[];
    try {
      lines = await runSearch(query, roots);
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : 'search failed' });
    }
    // Report repo-relative paths so the model's citations are readable.
    const rewritten = lines.map((line) => {
      for (const [name, root] of Object.entries(scope)) {
        if (line.startsWith(root)) return name + line.slice(root.length);
      }
      return line;
    });
    return json(res, 200, { matches: capMatches(rewritten, SEARCH_CAPS) });
  }

  if (req.method === 'POST' && url.pathname === '/read') {
    const body = await readBody(req);
    const repo = typeof body['repo'] === 'string' ? body['repo'] : '';
    const rel = typeof body['path'] === 'string' ? body['path'] : '';
    const root = repos[repo];
    if (!root) return json(res, 404, { error: `unknown repo "${repo}"` });

    const target = containedPath(root, rel);
    if (!target) return json(res, 403, { error: 'path escapes the repository' });

    let text: string;
    try {
      text = readFileSync(target, 'utf8');
    } catch {
      return json(res, 404, { error: 'not a readable file' });
    }

    const all = text.split('\n');
    const start = Math.max(1, Number(body['startLine']) || 1);
    const end = Math.min(all.length, start + MAX_READ_LINES - 1, Number(body['endLine']) || start + MAX_READ_LINES - 1);
    const slice = all.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`);
    return json(res, 200, {
      lines: slice,
      totalLines: all.length,
      truncated: end < all.length,
    });
  }

  return json(res, 404, { error: 'no such endpoint' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`lowdiff-daemon on http://127.0.0.1:${PORT} (search: ${searcher.cmd})`);
  console.log(`repos: ${Object.keys(repos).join(', ') || '(none — POST /repos to add)'}`);
  console.log(`\ntoken (paste into LowDiff options):\n${token}`);
});
