/**
 * Runtime-agnostic utilities — works under both Bun and Node.js.
 */

export const isBun = typeof globalThis.Bun !== "undefined"

/**
 * Async sleep that works in both Bun and Node.js.
 */
export function sleep(ms: number): Promise<void> {
  if (isBun) {
    return (globalThis as any).Bun.sleep(ms)
  }
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Trigger garbage collection if available.
 * In Bun: Bun.gc(true)
 * In Node: global.gc() (requires --expose-gc flag)
 */
export function gc(): void {
  if (isBun) {
    ;(globalThis as any).Bun.gc(true)
  } else if (typeof (globalThis as any).gc === "function") {
    ;(globalThis as any).gc()
  }
}

/**
 * Get the runtime version string.
 */
export function runtimeVersion(): string {
  if (isBun) {
    return `Bun ${(globalThis as any).Bun.version}`
  }
  return `Node.js ${process.version}`
}
