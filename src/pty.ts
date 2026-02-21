/**
 * PTY abstraction layer — tries bun-pty first, falls back to node-pty.
 *
 * Both libraries expose a nearly identical API, so this module normalizes the
 * minor differences behind a single interface.
 *
 * Resolution order:
 *  1. bun-pty  — works under Bun (uses Bun FFI)
 *  2. node-pty — works under Node.js (native C++ addon)
 *
 * We try bun-pty first because it will only successfully import + spawn under
 * a real Bun runtime. Under Node.js it will fail to import or to call FFI,
 * and we fall through to node-pty.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PtySpawnOptions {
  name?: string
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string | undefined>
}

export interface PtyProcess {
  readonly pid: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (e: { exitCode: number; signal?: number | string }) => void): { dispose(): void }
}

// ── Runtime detection ────────────────────────────────────────────────────────

export const isBun = typeof globalThis.Bun !== "undefined"

// ── Spawn ────────────────────────────────────────────────────────────────────

type SpawnFn = (file: string, args: string[], options: PtySpawnOptions) => PtyProcess

let _spawn: SpawnFn | null = null
let _backend: "bun-pty" | "node-pty" | null = null

function makeOptions(options: PtySpawnOptions) {
  return {
    name: options.name ?? "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: options.env as Record<string, string>,
  }
}

async function loadSpawn(): Promise<SpawnFn> {
  if (_spawn) return _spawn

  // Try bun-pty first (only works under real Bun runtime)
  try {
    const bunPty = await import("bun-pty")
    // Verify it actually works by checking the spawn function exists
    if (typeof bunPty.spawn === "function") {
      _spawn = (file, args, options) => bunPty.spawn(file, args, makeOptions(options))
      _backend = "bun-pty"
      return _spawn
    }
  } catch {
    // bun-pty not available or not in Bun runtime — continue
  }

  // Fall back to node-pty (works under Node.js)
  try {
    const nodePty = await import("node-pty")
    if (typeof nodePty.spawn === "function") {
      _spawn = (file, args, options) => nodePty.spawn(file, args, makeOptions(options))
      _backend = "node-pty"
      return _spawn
    }
  } catch {
    // node-pty not available either
  }

  throw new Error(
    "No PTY backend available. Install bun-pty (for Bun) or node-pty (for Node.js).",
  )
}

/**
 * Spawn a PTY process. Works with both bun-pty (Bun) and node-pty (Node.js).
 */
export async function spawnPty(
  file: string,
  args: string[],
  options: PtySpawnOptions = {},
): Promise<PtyProcess> {
  const doSpawn = await loadSpawn()
  return doSpawn(file, args, options)
}

/**
 * Returns the name of the PTY backend that was loaded, or null if not yet loaded.
 */
export function getBackend(): "bun-pty" | "node-pty" | null {
  return _backend
}
