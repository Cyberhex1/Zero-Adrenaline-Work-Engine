// Per-day activity history used by the Analytics charts.

const HISTORY_DAYS = 60;

/** Local-calendar day key, e.g. "2026-10-10". */
export const dayKey = (d: Date = new Date()): string => {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

/** Returns a copy of `history` with `update` applied to today's entry, keeping only recent days. */
export const updateDailyHistory = (
  history: Record<string, number> | undefined,
  update: (current: number | undefined) => number
): Record<string, number> => {
  const today = dayKey();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  const cutoffKey = dayKey(cutoff);

  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(history || {})) {
    if (key >= cutoffKey) next[key] = value;
  }
  next[today] = update(next[today]);
  return next;
};
