/** Parse "09:30, 13:00 19:00" into sorted, de-duplicated 24-hour HH:MM times. */
export type TimeListResult =
  | { ok: true; times: string[] }
  | { ok: false; message: string };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseTimeList(input: string, max = 8): TimeListResult {
  const parts = input
    .split(/[,\s;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, message: "Add at least one time, like 09:30." };
  const times: string[] = [];
  for (const part of parts) {
    const m = HHMM.exec(part);
    if (!m) return { ok: false, message: `"${part}" is not a time. Use 24-hour HH:MM, like 19:00.` };
    times.push(`${m[1].padStart(2, "0")}:${m[2]}`);
  }
  const unique = [...new Set(times)].sort();
  if (unique.length > max) return { ok: false, message: `At most ${max} times per platform.` };
  return { ok: true, times: unique };
}
