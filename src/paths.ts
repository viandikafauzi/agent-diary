/**
 * Cross-platform data-path helpers for Agent Diary.
 *
 * Each AI CLI stores its conversation data in different locations
 * depending on the operating system.  This module centralises those
 * lookups so parsers don't have to repeat the logic.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

const IS_WIN = process.platform === "win32";

/**
 * Return the path to Hermes's state database.
 *
 * - Linux / macOS  →  ~/.hermes/state.db
 * - Windows        →  %LOCALAPPDATA%/hermes/state.db  (preferred),
 *                     falls back to ~/.hermes/state.db if not found.
 */
export function hermesStateDbPath(): string {
  const unixPath = path.join(os.homedir(), ".hermes", "state.db");
  if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    const winPath = path.join(localAppData, "hermes", "state.db");
    if (fs.existsSync(winPath)) return winPath;
    if (fs.existsSync(unixPath)) return unixPath;
    return winPath;
  }
  return unixPath;
}

/**
 * Return the directory containing Pi session JSONL files.
 *
 * - Linux / macOS  →  ~/.pi/agent/sessions/
 * - Windows        →  %LOCALAPPDATA%/pi/agent/sessions/  (preferred),
 *                     falls back to ~/.pi/agent/sessions/ if not found.
 */
export function piSessionsDir(): string {
  const unixPath = path.join(os.homedir(), ".pi", "agent", "sessions");
  if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    const winPath = path.join(localAppData, "pi", "agent", "sessions");
    // Prefer platform path, fall back to Unix-style path since pi
    // sometimes stores data there even on Windows.
    if (fs.existsSync(winPath)) return winPath;
    if (fs.existsSync(unixPath)) return unixPath;
    return winPath;
  }
  return unixPath;
}

/**
 * Return the directory containing Claude Code CLI project folders.
 *
 * - Linux / macOS  →  ~/.claude/projects/
 * - Windows        →  ~/.claude/projects/  (works via git-bash / MSYS)
 */
export function claudeProjectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

/**
 * Return the root of Claude Desktop local-agent-mode session data.
 *
 * - Windows  →  %APPDATA%/Claude/local-agent-mode-sessions/
 * - Others   →  null (no known consistent layout yet)
 *
 * Returns null on platforms where the path is not known so callers can
 * gracefully skip Desktop session scanning.
 */
export function claudeDesktopSessionsDir(): string | null {
  if (!IS_WIN) return null;
  const appData =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Claude", "local-agent-mode-sessions");
}

/**
 * Return the path to OpenCode's state database.
 *
 * - Linux / macOS  →  ~/.local/share/opencode/opencode.db
 * - Windows        →  %LOCALAPPDATA%/opencode/opencode.db  (best guess)
 */
export function opencodeDbPath(): string {
  const unixPath = path.join(
    os.homedir(),
    ".local",
    "share",
    "opencode",
    "opencode.db",
  );
  if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    const winPath = path.join(localAppData, "opencode", "opencode.db");
    // Prefer platform path, but fall back to Unix-style path since opencode
    // sometimes stores data there even on Windows (e.g. when run via Node).
    if (fs.existsSync(winPath)) return winPath;
    if (fs.existsSync(unixPath)) return unixPath;
    return winPath;
  }
  return unixPath;
}
