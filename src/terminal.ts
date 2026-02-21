import pkg from "@xterm/headless"
const { Terminal } = pkg
import serializePkg from "@xterm/addon-serialize"
const { SerializeAddon } = serializePkg
import { spawnPty, type PtyProcess } from "./pty.js"

export interface TerminalOptions {
  cols?: number
  rows?: number
  shell?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string | undefined>
}

export interface CellInfo {
  char: string
  fg: string // hex color
  bg: string // hex color
  bold: boolean
  italic: boolean
  dim: boolean
  underline: boolean
  strikethrough: boolean
  inverse: boolean
}

// Default 256-color palette (standard + cube + grayscale)
const PALETTE_256: string[] = (() => {
  const colors: string[] = [
    // Standard 16 colors
    "#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
    "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff",
  ]
  // 216 color cube (6x6x6)
  const levels = [0, 95, 135, 175, 215, 255]
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        colors.push(
          `#${levels[r].toString(16).padStart(2, "0")}${levels[g].toString(16).padStart(2, "0")}${levels[b].toString(16).padStart(2, "0")}`,
        )
      }
    }
  }
  // 24 grayscale
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10
    const hex = v.toString(16).padStart(2, "0")
    colors.push(`#${hex}${hex}${hex}`)
  }
  return colors
})()

export class HeadlessTerminal {
  private xterm: InstanceType<typeof Terminal>
  private serialize: InstanceType<typeof SerializeAddon>
  private pty: PtyProcess | null = null
  private _exited = false
  private _exitCode: number | null = null
  private _exitPromise: Promise<number> | null = null

  readonly cols: number
  readonly rows: number

  constructor(options: TerminalOptions = {}) {
    this.cols = options.cols ?? 80
    this.rows = options.rows ?? 24

    this.xterm = new Terminal({
      cols: this.cols,
      rows: this.rows,
      allowProposedApi: true,
      scrollback: 1000,
    })

    this.serialize = new SerializeAddon()
    this.xterm.loadAddon(this.serialize)
  }

  async spawn(options: TerminalOptions = {}): Promise<void> {
    const shell = options.shell ?? process.env.SHELL ?? "/bin/bash"
    const args = options.args ?? []
    const cwd = options.cwd ?? process.cwd()

    this.pty = await spawnPty(shell, args, {
      name: "xterm-256color",
      cols: this.cols,
      rows: this.rows,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        ...options.env,
      },
    })

    this.pty.onData((data: string) => {
      this.xterm.write(data)
    })

    this._exitPromise = new Promise<number>((resolve) => {
      this.pty!.onExit(({ exitCode }) => {
        this._exited = true
        this._exitCode = exitCode
        resolve(exitCode)
      })
    })
  }

  write(data: string): void {
    if (!this.pty) throw new Error("Terminal not spawned")
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    if (this.pty) this.pty.resize(cols, rows)
    this.xterm.resize(cols, rows)
  }

  // Wait for xterm to finish parsing all pending data
  flush(): Promise<void> {
    return new Promise((resolve) => {
      // Write an empty string with callback to ensure all prior writes are parsed
      this.xterm.write("", resolve)
    })
  }

  get exited(): boolean {
    return this._exited
  }

  get exitCode(): number | null {
    return this._exitCode
  }

  waitForExit(): Promise<number> {
    if (!this._exitPromise) throw new Error("Terminal not spawned")
    return this._exitPromise
  }

  // Get plain text content of the screen
  getText(): string {
    const buffer = this.xterm.buffer.active
    const lines: string[] = []
    for (let y = 0; y < this.rows; y++) {
      const line = buffer.getLine(y)
      if (line) {
        lines.push(line.translateToString(true))
      }
    }
    return lines.join("\n")
  }

  // Get the full cell grid with color/attribute info
  getCellGrid(): CellInfo[][] {
    const buffer = this.xterm.buffer.active
    const grid: CellInfo[][] = []

    for (let y = 0; y < this.rows; y++) {
      const line = buffer.getLine(y)
      const row: CellInfo[] = []
      if (line) {
        for (let x = 0; x < this.cols; x++) {
          const cell = line.getCell(x)
          if (cell) {
            row.push({
              char: cell.getChars() || " ",
              fg: this.resolveColor(cell, "fg"),
              bg: this.resolveColor(cell, "bg"),
              bold: cell.isBold() === 1,
              italic: cell.isItalic() === 1,
              dim: cell.isDim() === 1,
              underline: cell.isUnderline() === 1,
              strikethrough: cell.isStrikethrough() === 1,
              inverse: cell.isInverse() === 1,
            })
          }
        }
      }
      grid.push(row)
    }
    return grid
  }

  private resolveColor(
    cell: ReturnType<NonNullable<ReturnType<typeof this.xterm.buffer.active.getLine>>["getCell"]>,
    type: "fg" | "bg",
  ): string {
    if (!cell) return type === "fg" ? "#c0c0c0" : "#000000"

    const isDefault = type === "fg" ? cell.isFgDefault() : cell.isBgDefault()
    const isPalette = type === "fg" ? cell.isFgPalette() : cell.isBgPalette()
    const isRGB = type === "fg" ? cell.isFgRGB() : cell.isBgRGB()
    const color = type === "fg" ? cell.getFgColor() : cell.getBgColor()

    if (isDefault) return type === "fg" ? "#c0c0c0" : "#1e1e1e"

    if (isPalette) {
      return PALETTE_256[color] ?? (type === "fg" ? "#c0c0c0" : "#1e1e1e")
    }

    if (isRGB) {
      const r = (color >> 16) & 0xff
      const g = (color >> 8) & 0xff
      const b = color & 0xff
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
    }

    return type === "fg" ? "#c0c0c0" : "#1e1e1e"
  }

  // Get HTML representation via serialize addon
  getHTML(): string {
    return this.serialize.serializeAsHTML()
  }

  getCursorPosition(): { x: number; y: number } {
    return {
      x: this.xterm.buffer.active.cursorX,
      y: this.xterm.buffer.active.cursorY,
    }
  }

  kill(signal?: string): void {
    if (this.pty) {
      this.pty.kill(signal)
    }
  }

  destroy(): void {
    this.kill()
    this.xterm.dispose()
  }
}
