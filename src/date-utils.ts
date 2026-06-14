/**
 * Date-range resolution for Agent Diary.
 *
 * Converts a --date and optional --range into a DateRange object
 * that drives session filtering across all parsers.
 *
 * IMPORTANT: All timestamps are computed in **local time** to stay
 * compatible with the parsers, which historically used local-time
 * constructors (new Date("YYYY-MM-DDT00:00:00") without "Z").
 *
 * Supported --range values:
 *   week              – 7 rolling days   (from --date or today)
 *   month             – 30 rolling days  (from --date or today)
 *   year              – 365 rolling days (from --date or today)
 *   <month-name>      – calendar month (e.g. "June", case-insensitive)
 *   YYYY-MM           – specific calendar month
 *   YYYY              – specific calendar year
 */

import type { DateRange } from "./types.js";

// ---------------------------------------------------------------------------
// Locale helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Case-insensitive month-name → 0-based index */
const MONTH_INDEX: Record<string, number> = {};
for (let i = 0; i < LONG_MONTHS.length; i++) {
  MONTH_INDEX[LONG_MONTHS[i].toLowerCase()] = i;
}

function monthNameToIndex(name: string): number | null {
  return MONTH_INDEX[name.toLowerCase()] ?? null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Return local-time epoch ms for the start of the given date.
 * e.g. "2026-06-11" → midnight June 11 in the running timezone.
 */
function localDayStart(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getTime();
}

/**
 * Return local-time epoch ms for the last millisecond of the given date.
 * e.g. "2026-06-11" → 23:59:59.999 June 11 in the running timezone.
 */
function localDayEnd(dateStr: string): number {
  return new Date(dateStr + "T23:59:59.999").getTime();
}

/** Format a Date in local time as "Jun 5". */
function formatShort(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a --date (optional, defaults to today) and --range (optional)
 * into a DateRange.
 *
 * When rangeArg is undefined/null the result describes a single day.
 */
export function resolveDateRange(
  dateArg: string | undefined,
  rangeArg: string | undefined,
): DateRange {
  const anchorDate = dateArg ?? todayString();

  // Validate by attempting to parse
  if (isNaN(localDayStart(anchorDate))) {
    throw new Error(`Invalid anchor date "${anchorDate}".`);
  }

  // ── No range → single day ──────────────────────────────────────────
  if (!rangeArg) {
    const startMs = localDayStart(anchorDate);
    const endMs = localDayEnd(anchorDate);
    return { startMs, endMs, label: anchorDate, rangeArg: null };
  }

  const lower = rangeArg.toLowerCase();

  // ── Rolling-window keywords (local-time arithmetic) ────────────────
  if (lower === "week") {
    const endMs = localDayEnd(anchorDate);
    const startMs = localDayStart(anchorDate) - 6 * MS_PER_DAY; // 7 days total
    const label = `${formatShort(new Date(startMs))}–${formatShort(new Date(endMs))} (7 days)`;
    return { startMs, endMs, label, rangeArg };
  }

  if (lower === "month") {
    const endMs = localDayEnd(anchorDate);
    const startMs = localDayStart(anchorDate) - 29 * MS_PER_DAY; // 30 days total
    const label = `${formatShort(new Date(startMs))}–${formatShort(new Date(endMs))} (30 days)`;
    return { startMs, endMs, label, rangeArg };
  }

  if (lower === "year") {
    const endMs = localDayEnd(anchorDate);
    const startMs = localDayStart(anchorDate) - 364 * MS_PER_DAY; // 365 days total
    const label = `${formatShort(new Date(startMs))}–${formatShort(new Date(endMs))} (365 days)`;
    return { startMs, endMs, label, rangeArg };
  }

  // ── Month names (e.g. "June", "june") ──────────────────────────────
  const monthIdx = monthNameToIndex(rangeArg);
  if (monthIdx !== null) {
    // Use the --date year as context, falling back to current year
    const year = dateArg
      ? new Date(dateArg + "T00:00:00").getFullYear()
      : new Date().getFullYear();
    const startMs = new Date(year, monthIdx, 1).getTime();
    const endMs = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999).getTime();
    const displayName = LONG_MONTHS[monthIdx];
    return { startMs, endMs, label: `${displayName} ${year}`, rangeArg };
  }

  // ── YYYY-MM (specific calendar month) ──────────────────────────────
  if (/^\d{4}-\d{2}$/.test(rangeArg)) {
    const [y, m] = rangeArg.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      const startMs = new Date(y, m - 1, 1).getTime();
      const endMs = new Date(y, m, 0, 23, 59, 59, 999).getTime();
      return { startMs, endMs, label: `${LONG_MONTHS[m - 1]} ${y}`, rangeArg };
    }
    throw new Error(
      `Invalid month in --range "${rangeArg}". Month must be 01-12.`,
    );
  }

  // ── YYYY (specific calendar year) ─────────────────────────────────
  if (/^\d{4}$/.test(rangeArg)) {
    const y = parseInt(rangeArg, 10);
    const startMs = new Date(y, 0, 1).getTime();
    const endMs = new Date(y, 11, 31, 23, 59, 59, 999).getTime();
    return { startMs, endMs, label: `${y}`, rangeArg };
  }

  throw new Error(
    `Unrecognized --range value "${rangeArg}". ` +
      "Expected: week | month | year | <month-name> | YYYY-MM | YYYY",
  );
}
