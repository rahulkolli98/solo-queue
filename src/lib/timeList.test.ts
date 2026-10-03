import { describe, expect, it } from "vitest";
import { parseTimeList } from "./timeList";

describe("parseTimeList", () => {
  it("sorts, de-duplicates and zero-pads", () => {
    expect(parseTimeList("19:00, 9:30, 09:30 13:00")).toEqual({ ok: true, times: ["09:30", "13:00", "19:00"] });
  });
  it("accepts commas, spaces and semicolons", () => {
    expect(parseTimeList("08:00;12:00 18:00,21:00")).toEqual({ ok: true, times: ["08:00", "12:00", "18:00", "21:00"] });
  });
  it("names the offending entry", () => {
    expect(parseTimeList("09:30, 25:00")).toEqual({ ok: false, message: '"25:00" is not a time. Use 24-hour HH:MM, like 19:00.' });
    expect(parseTimeList("noon")).toMatchObject({ ok: false });
  });
  it("needs at least one time and at most eight", () => {
    expect(parseTimeList("  ")).toMatchObject({ ok: false });
    expect(parseTimeList("01:00 02:00 03:00 04:00 05:00 06:00 07:00 08:00 09:00")).toMatchObject({ ok: false });
  });
});
