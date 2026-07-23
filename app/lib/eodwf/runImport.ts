import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTribeCalendarEvents } from "./fetchTribeEvents";
import { fetchMonthlyGatherings } from "./parseGatheringsPage";
import { fetchRetreats } from "./parseRetreatsPage";
import { upsertPendingEodwfEvents, type UpsertPendingResult } from "./upsertPendingEvents";
import type { NormalizedEodwfEvent } from "./types";

export type EodwfImportSummary = UpsertPendingResult & {
  fetched: {
    calendar: number;
    gatherings: number;
    retreats: number;
    total: number;
  };
  fetchErrors: string[];
};

export async function runEodwfEventsImport(admin: SupabaseClient): Promise<EodwfImportSummary> {
  const fetchErrors: string[] = [];
  let calendar: NormalizedEodwfEvent[] = [];
  let gatherings: NormalizedEodwfEvent[] = [];
  let retreats: NormalizedEodwfEvent[] = [];

  try {
    calendar = await fetchTribeCalendarEvents();
  } catch (err) {
    fetchErrors.push(`calendar: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    gatherings = await fetchMonthlyGatherings();
  } catch (err) {
    fetchErrors.push(`gatherings: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    retreats = await fetchRetreats();
  } catch (err) {
    fetchErrors.push(`retreats: ${err instanceof Error ? err.message : String(err)}`);
  }

  const all = [...calendar, ...gatherings, ...retreats];
  const upsert = await upsertPendingEodwfEvents(admin, all);

  return {
    ...upsert,
    fetched: {
      calendar: calendar.length,
      gatherings: gatherings.length,
      retreats: retreats.length,
      total: all.length,
    },
    fetchErrors,
  };
}
