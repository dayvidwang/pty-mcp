/**
 * Runtime utilities (Bun only).
 */

export const isBun = true

export function sleep(ms: number): Promise<void> {
  return Bun.sleep(ms)
}

export function gc(): void {
  Bun.gc(true)
}

export function runtimeVersion(): string {
  return `Bun ${Bun.version}`
}
