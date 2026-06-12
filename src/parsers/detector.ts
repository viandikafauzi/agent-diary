import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function detectSources(): string[] {
  const home = os.homedir();
  const sources: string[] = [];

  if (fs.existsSync(path.join(home, ".hermes", "state.db"))) {
    sources.push("hermes");
  }
  if (
    fs.existsSync(path.join(home, ".pi", "agent", "sessions")) &&
    fs.statSync(path.join(home, ".pi", "agent", "sessions")).isDirectory()
  ) {
    sources.push("pi");
  }
  if (
    fs.existsSync(path.join(home, ".claude", "projects")) &&
    fs.statSync(path.join(home, ".claude", "projects")).isDirectory()
  ) {
    sources.push("claude");
  }
  if (fs.existsSync(path.join(home, ".local", "share", "opencode", "opencode.db"))) {
    sources.push("opencode");
  }

  return sources;
}
