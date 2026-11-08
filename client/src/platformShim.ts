/**
 * Make the browser's `process` polyfill agree with VS Code about the operating system.
 *
 * VS Code (inside lean4monaco) decides "is this Windows?" from `navigator.userAgent` when it
 * formats file paths, but its `path` module asks `process.platform`, which the node polyfill
 * leaves undefined. On a Windows browser the two disagree: paths come out as `\MonoidalWorld\1.lean`
 * and are then parsed as POSIX, so the in-memory file system can't find their parent folder,
 * the editor can't create the level's file, and the Lean client never starts.
 *
 * This module must be imported before anything that loads VS Code code.
 */
import process from 'process'

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const platform = ua.indexOf('Windows') >= 0 ? 'win32'
  : ua.indexOf('Macintosh') >= 0 ? 'darwin' : 'linux'

for (const p of [process as any, (globalThis as any).process]) {
  if (p && !p.platform) {
    try { p.platform = platform } catch { /* frozen polyfill: nothing to do */ }
  }
}
