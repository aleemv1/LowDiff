/**
 * Resolve a changed file's imports to paths that exist in the repository
 * tree, so the scan can fetch what the file builds on. Regex, not a module
 * resolver: a missed import costs one context file, nothing more.
 */

const JS_SPECIFIER =
  /(?:import|export)\s[^'"]*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g;
const PY_SPECIFIER = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;

/** Candidate repo paths for one JS-style relative specifier. */
function jsCandidates(fromDir: string, specifier: string): string[] {
  const joined = normalize(`${fromDir}/${specifier}`);
  const bare = joined.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
  return [
    joined,
    `${bare}.ts`, `${bare}.tsx`, `${bare}.js`, `${bare}.jsx`,
    `${bare}/index.ts`, `${bare}/index.js`,
  ];
}

function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

export function resolveImports(
  path: string,
  content: string,
  tree: ReadonlySet<string>,
): string[] {
  const fromDir = path.split('/').slice(0, -1).join('/');
  const out: string[] = [];
  const seen = new Set<string>([path]);

  const add = (candidates: string[]) => {
    for (const candidate of candidates) {
      if (tree.has(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        out.push(candidate);
        return;
      }
    }
  };

  for (const match of content.matchAll(JS_SPECIFIER)) {
    const specifier = match[1] ?? match[2];
    // Only relative specifiers can be repo files; 'preact' is a package.
    if (!specifier || !specifier.startsWith('.')) continue;
    add(jsCandidates(fromDir, specifier));
  }

  for (const match of content.matchAll(PY_SPECIFIER)) {
    const module = match[1] ?? match[2];
    if (!module) continue;
    const base = module.replace(/^\.+/, '').split('.').join('/');
    const relative = module.startsWith('.') ? `${fromDir}/${base}` : base;
    add([`${normalize(relative)}.py`, `${normalize(relative)}/__init__.py`]);
  }

  return out;
}
