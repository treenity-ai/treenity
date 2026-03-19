#!/usr/bin/env node
// Post-build: rewrite #subpath imports → relative paths in dist/
// Runs after tsc. Reads package.json "imports" field, walks dist/*.js,
// replaces `from '#xxx'` with `from './relative/path.js'`.
// Prevents dual-module issues in bundlers (Vite, webpack) that don't
// fully support Node.js package.json "imports" field.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const pkgPath = resolve('package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const imports = pkg.imports;
if (!imports) {
  process.exit(0);
}

const distDir = resolve('dist');

function resolveHash(specifier) {
  for (const [pattern, spec] of Object.entries(imports)) {
    if (pattern === specifier) return resolveSpec(spec);
    if (pattern.includes('*')) {
      const [prefix, suffix] = pattern.split('*');
      if (specifier.startsWith(prefix) && (!suffix || specifier.endsWith(suffix))) {
        const matched = specifier.slice(prefix.length, suffix ? -suffix.length || undefined : undefined);
        return resolveSpec(spec, matched);
      }
    }
  }
  return null;
}

function resolveSpec(spec, wildcard) {
  if (typeof spec === 'string') return tryFile(wildcard ? spec.replace('*', wildcard) : spec);
  if (Array.isArray(spec)) {
    for (const s of spec) {
      const r = tryFile(wildcard ? s.replace('*', wildcard) : s);
      if (r) return r;
    }
    return null;
  }
  if (spec.default) return resolveSpec(spec.default, wildcard);
  return null;
}

function tryFile(rel) {
  const abs = resolve(rel);
  try { statSync(abs); return abs; } catch {}
  for (const ext of ['.js', '.jsx']) {
    try { statSync(abs + ext); return abs + ext; } catch {}
  }
  return null;
}

const HASH_RE = /from\s+['"]#([^'"]+)['"]/g;
let files = 0, rewrites = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith('.js') && !entry.name.endsWith('.jsx')) continue;

    const src = readFileSync(full, 'utf-8');
    if (!src.includes("'#") && !src.includes('"#')) continue;

    let changed = false;
    const out = src.replace(HASH_RE, (match, specifier) => {
      const resolved = resolveHash('#' + specifier);
      if (!resolved) { console.warn(`  WARN: unresolved #${specifier} in ${full}`); return match; }
      let rel = relative(dirname(full), resolved);
      if (!rel.startsWith('.')) rel = './' + rel;
      changed = true;
      rewrites++;
      return `from '${rel}'`;
    });

    if (changed) { writeFileSync(full, out); files++; }
  }
}

walk(distDir);
if (rewrites) console.log(`fix-hash-imports: ${rewrites} imports in ${files} files`);

// --copy-assets: copy non-ts files (css, etc) from src/ to dist/
if (process.argv.includes('--copy-assets')) {
  const srcDir = resolve('src');
  let copied = 0;
  function copyAssets(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { copyAssets(full); continue; }
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) continue;
      const rel = relative(srcDir, full);
      const dest = join(distDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(full, dest);
      copied++;
    }
  }
  copyAssets(srcDir);
  if (copied) console.log(`fix-hash-imports: copied ${copied} assets`);
}
