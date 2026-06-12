import fs from "node:fs";
import {
  hermesStateDbPath,
  piSessionsDir,
  claudeProjectsDir,
  claudeDesktopSessionsDir,
  opencodeDbPath,
} from "../paths.js";

export function detectSources(): string[] {
  const sources: string[] = [];

  if (fs.existsSync(hermesStateDbPath())) {
    sources.push("hermes");
  }
  const piDir = piSessionsDir();
  if (
    fs.existsSync(piDir) &&
    fs.statSync(piDir).isDirectory()
  ) {
    sources.push("pi");
  }
  const claudeDir = claudeProjectsDir();
  const desktopDir = claudeDesktopSessionsDir();
  if (
    (fs.existsSync(claudeDir) && fs.statSync(claudeDir).isDirectory()) ||
    (desktopDir !== null && fs.existsSync(desktopDir))
  ) {
    sources.push("claude");
  }
  if (fs.existsSync(opencodeDbPath())) {
    sources.push("opencode");
  }

  return sources;
}
