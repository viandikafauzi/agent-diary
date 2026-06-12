#!/usr/bin/env node

/**
 * Agent Diary — Sentiment + interaction analysis of AI agent conversation logs.
 *
 * Usage:
 *   npx agent-diary                  # today
 *   npx agent-diary --date 2026-06-12
 *   npx agent-diary --sources hermes,claude
 *   npx agent-diary --output report.html
 */

import { parseArgs } from "node:util";
import { run } from "./cli.js";

run();
