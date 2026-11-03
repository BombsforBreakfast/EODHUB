import { strict as assert } from "node:assert";
import { test } from "node:test";
import { emptyEventDraft, eventFields, parseEventDraft, parseEventSchedule } from "../app/lib/ticketing/event-intake";

const schedule = { localStart: "2026-12-05T09:00", localEnd: "2026-12-05T17:00", timeZone: "America/New_York" };

test("event submission requires both start and finish, with finish strictly later", () => {
  for (const localEnd of ["", undefined]) assert.throws(() => parseEventSchedule({ ...schedule, localEnd }), /finish date and time/);
  assert.throws(() => parseEventSchedule({ ...schedule, localStart: "" }), /start date and time/);
  for (const localEnd of [schedule.localStart, "2026-12-05T08:59", "2026-12-04T17:00"]) assert.throws(() => parseEventSchedule({ ...schedule, localEnd }), /finish must be after the start/);
});

test("overnight schedules use an explicit finish date and preserve the event time zone", () => {
  const parsed = parseEventSchedule({ localStart: "2026-12-05T22:00", localEnd: "2026-12-06T01:30", timeZone: "America/Los_Angeles" });
  assert.equal(parsed.startsAt, "2026-12-06T06:00:00.000Z");
  assert.equal(parsed.endsAt, "2026-12-06T09:30:00.000Z");
  assert.equal(parsed.localEnd, "2026-12-06T01:30");
});

test("finish conversion handles a DST transition and rejects a non-existent finish time", () => {
  const duringDst = { ...schedule, localStart: "2027-03-14T01:30", localEnd: "2027-03-14T03:30" };
  const parsed = parseEventSchedule(duringDst);
  assert.equal(Date.parse(parsed.endsAt) - Date.parse(parsed.startsAt), 60 * 60 * 1000);
  assert.throws(() => parseEventSchedule({ ...duringDst, localEnd: "2027-03-14T02:30" }), /does not exist/);
});

test("the saved event payload includes both wall-clock details and converted schedule endpoints", () => {
  const draft = { ...emptyEventDraft(), ...schedule, title: "Schedule QA event", organizer: "QA organizer", venue: "QA venue", address: "123 Example Street", city: "Test City", region: "NC", description: "A disposable test event for schedule validation.", contactName: "QA Organizer", contactPhone: "555-555-1234", contactEmail: "qa@example.invalid" };
  const parsed = parseEventDraft(draft), event = eventFields(parsed);
  assert.equal(parsed.draft.localEnd, schedule.localEnd);
  assert.equal(event.startsAt, "2026-12-05T14:00:00.000Z");
  assert.equal(event.endsAt, "2026-12-05T22:00:00.000Z");
  assert.throws(() => parseEventDraft({ ...draft, localEnd: "" }), /finish date and time/);
});
