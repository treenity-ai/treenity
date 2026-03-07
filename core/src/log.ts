// Unified logging: tree-persisted nodes + ring buffer fallback + debug filter + console intercept

import { AsyncLocalStorage } from 'node:async_hooks'
import type { Tree } from '#tree'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  t: number
  level: LogLevel
  msg: string
  code?: string
  sub?: string
  userId?: string
  method?: string
  path?: string
}

export interface LogContext {
  userId?: string
  method?: string
  path?: string
}

export const logContext = new AsyncLocalStorage<LogContext>()

// ── Tree storage ──

let logTree: Tree | undefined

export function setLogTree(tree: Tree) {
  logTree = tree
  // flush ring buffer to tree
  for (const entry of getOrdered()) {
    writeNode(entry)
  }
  buffer.length = 0
  cursor = 0
  total = 0
}

// ── Timestamp ID: YYMMDD-HHmmss-mmm-NNN ──

let lastMs = 0
let seq = 0

function makeLogPath(): string {
  const now = Date.now()
  if (now === lastMs) {
    seq++
  } else {
    lastMs = now
    seq = 0
  }

  const d = new Date(now)
  const yy = String(d.getFullYear()).slice(2)
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  const sq = String(seq).padStart(3, '0')

  return `/sys/logs/${yy}${MM}${dd}-${hh}${mm}${ss}-${ms}-${sq}`
}

function writeNode(entry: LogEntry) {
  if (!logTree) return
  logTree.set({ $path: makeLogPath(), $type: 't.log', ...entry }).catch(() => {})
}

// ── Ring buffer (fallback before tree init) ──

const MAX = 2000
const buffer: LogEntry[] = []
let cursor = 0
let total = 0

function push(level: LogLevel, args: unknown[]) {
  // Extract [tag] → sub
  let sub: string | undefined
  if (typeof args[0] === 'string') {
    const m = args[0].match(/^\[([^\]]+)\]$/)
    if (m) {
      sub = m[1]
      args = args.slice(1)
    }
  }

  // Extract UPPER_SNAKE code
  let code: string | undefined
  if (args.length > 1 && typeof args[0] === 'string' && /^[A-Z][A-Z0-9_]+$/.test(args[0])) {
    code = args[0]
    args = args.slice(1)
  }

  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  const ctx = logContext.getStore()

  const entry: LogEntry = {
    t: Date.now(),
    level,
    msg,
    ...(code && { code }),
    ...(sub && { sub }),
    ...(ctx?.userId && { userId: ctx.userId }),
    ...(ctx?.method && { method: ctx.method }),
    ...(ctx?.path && { path: ctx.path }),
  }

  if (logTree) {
    writeNode(entry)
  } else {
    if (total < MAX) {
      buffer.push(entry)
    } else {
      buffer[cursor] = entry
    }
    cursor = (cursor + 1) % MAX
    total++
  }
}

/** Get ordered log entries from ring buffer (oldest first) */
function getOrdered(): LogEntry[] {
  if (total <= MAX) return buffer.slice()
  return [...buffer.slice(cursor), ...buffer.slice(0, cursor)]
}

// ── Query (ring buffer fallback — when tree available, use sift via getChildren) ──

export interface LogQuery {
  grep?: string
  level?: LogLevel | LogLevel[]
  head?: number
  tail?: number
}

export function queryLogs(opts: LogQuery = {}): LogEntry[] {
  let entries = getOrdered()

  if (opts.level) {
    const levels = Array.isArray(opts.level) ? opts.level : [opts.level]
    entries = entries.filter(e => levels.includes(e.level))
  }

  if (opts.grep) {
    const re = new RegExp(opts.grep, 'i')
    entries = entries.filter(e => re.test(e.msg))
  }

  if (opts.tail) entries = entries.slice(-opts.tail)
  if (opts.head) entries = entries.slice(0, opts.head)

  return entries
}

export function logStats() {
  return { buffered: Math.min(total, MAX), total, max: MAX }
}

// ── Debug filter ──

const enabled = new Set<string>()
let all = false

export function setDebug(filter: string) {
  enabled.clear()
  all = false
  if (filter === '*') { all = true; return }
  for (const s of filter.split(',')) {
    const t = s.trim()
    if (t) enabled.add(t)
  }
}

if (typeof process !== 'undefined' && process.env?.DEBUG) {
  setDebug(process.env.DEBUG)
}

;(globalThis as Record<string, unknown>).setDebug = setDebug

export function createLogger(name: string) {
  const tag = `[${name}]`
  return {
    debug(...args: unknown[]) { if (all || enabled.has(name)) console.debug(tag, ...args) },
    info(...args: unknown[]) { console.info(tag, ...args) },
    warn(...args: unknown[]) { console.warn(tag, ...args) },
    error(...args: unknown[]) { console.error(tag, ...args) },
  }
}

// ── Console intercept — call once at startup ──

let intercepted = false

export function interceptConsole() {
  if (intercepted) return
  intercepted = true

  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    const orig = console[level]
    console[level] = (...args: unknown[]) => {
      push(level, args)
      orig.apply(console, args)
    }
  }

  // console.log → info level
  const origLog = console.log
  console.log = (...args: unknown[]) => {
    push('info', args)
    origLog.apply(console, args)
  }
}
