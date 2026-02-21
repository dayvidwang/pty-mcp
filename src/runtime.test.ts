import { describe, test, expect } from "vitest"
import { isBun, sleep, gc, runtimeVersion } from "./runtime"

describe("runtime utilities", () => {
  test("isBun correctly detects the runtime", () => {
    const expected = typeof globalThis.Bun !== "undefined"
    expect(isBun).toBe(expected)
  })

  test("sleep resolves after the specified duration", async () => {
    const start = performance.now()
    await sleep(50)
    const elapsed = performance.now() - start
    // Allow some tolerance (at least 40ms, under 200ms)
    expect(elapsed).toBeGreaterThanOrEqual(40)
    expect(elapsed).toBeLessThan(200)
  })

  test("sleep(0) resolves quickly", async () => {
    const start = performance.now()
    await sleep(0)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50)
  })

  test("gc does not throw", () => {
    expect(() => gc()).not.toThrow()
  })

  test("runtimeVersion returns a descriptive string", () => {
    const version = runtimeVersion()
    expect(typeof version).toBe("string")
    expect(version.length).toBeGreaterThan(0)
    if (isBun) {
      expect(version).toMatch(/^Bun /)
    } else {
      expect(version).toMatch(/^Node\.js v/)
    }
  })
})
