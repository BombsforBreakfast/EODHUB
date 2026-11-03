import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseManualTime, displayManualTime } from "../app/lib/ticketing/local-time";
import { eventStartFromLocal } from "../app/lib/ticketing/model";

test("manual times distinguish noon, midnight, AM/PM and 24-hour input", () => {
  for (const [typed, expected] of [["12:00 AM", "00:00"], ["12:00 PM", "12:00"], ["9:15 pm", "21:15"], [" 9 AM ", "09:00"], ["14:30", "14:30"], ["0:05", "00:05"], ["23:59", "23:59"]]) assert.equal(parseManualTime(typed), expected);
  for (const typed of ["", "24:00", "13 PM", "00 AM", "9:60", "9:3", "noon", "09:30 garbage"]) assert.equal(parseManualTime(typed), null);
});

test("saved 24-hour values reopen in readable 12-hour form without changing the time", () => {
  for (const saved of ["00:00", "09:15", "12:00", "14:30", "23:59"]) assert.equal(parseManualTime(displayManualTime(saved)), saved);
  assert.equal(displayManualTime("12:00"), "12:00 PM");
  assert.equal(displayManualTime("00:00"), "12:00 AM");
  assert.equal(displayManualTime("9:"), "9:");
});

test("typed wall-clock times retain the event time zone and reject a DST gap", () => {
  assert.equal(eventStartFromLocal(`2026-12-05T${parseManualTime("9 AM")}`, "America/New_York"), "2026-12-05T14:00:00.000Z");
  assert.throws(() => eventStartFromLocal(`2027-03-14T${parseManualTime("2:30 AM")}`, "America/New_York"), /does not exist/);
});
