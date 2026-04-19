import type { RabbitholeReply, RabbitholeThread, RabbitholeTopic } from "./types";

export const rabbitholeTopics: RabbitholeTopic[] = [
  {
    slug: "cuas",
    name: "CUAS",
    description: "Counter-UAS tactics, systems, and field lessons.",
    subtopics: ["GPSNAV", "Detection", "Jamming", "Exploitation"],
    tags: ["Garmin", "Counter-UAS", "RF", "Telemetry"],
  },
  {
    slug: "counter-ied",
    name: "Counter IED",
    description: "Procedures, safety, and post-incident analysis for IED threats.",
    subtopics: ["Defeat the Device", "Render Safe", "Route Clearance"],
    tags: ["TTPs", "Forensics", "C-IED"],
  },
  {
    slug: "uas",
    name: "UAS",
    description: "Platform behavior, payload tradeoffs, and mission planning.",
    subtopics: ["Airframes", "Autonomy", "Payloads"],
    tags: ["Unmanned Aerial Systems", "ISR", "Flight Planning"],
  },
  {
    slug: "training",
    name: "Training",
    description: "Programs, drills, and readiness patterns for teams.",
    subtopics: ["Qualification", "Ranges", "Evaluation"],
    tags: ["SOP", "After Action", "Readiness"],
  },
];

/** Legacy mock data — kept for reference only. All live data comes from promoted feed/unit posts. */
export const rabbitholeThreads: RabbitholeThread[] = [
  {
    id: "rh-001",
    title: "Garmin GPS spoofing indicators in low-altitude CUAS events",
    curatorNote: "Documents repeat indicators seen during spoofing attempts.",
    topicSlug: "cuas",
    topicName: "CUAS",
    subtopic: "GPSNAV",
    tags: ["Garmin", "Counter-UAS", "Jamming"],
    author: "Ops Chief",
    createdAt: "2026-03-26T09:00:00.000Z",
    lastActivityAt: "2026-04-05T18:20:00.000Z",
    replyCount: 3,
    isHighValue: true,
    sourceType: "feed",
  },
  {
    id: "rh-002",
    title: "UAS payload recovery chain of custody checklist",
    curatorNote: "Working draft for preserving evidentiary value from first touch to lab handoff.",
    topicSlug: "uas",
    topicName: "UAS",
    subtopic: "Payloads",
    tags: ["Unmanned Aerial Systems", "Exploitation", "Forensics"],
    author: "Tech Sgt",
    createdAt: "2026-03-28T12:10:00.000Z",
    lastActivityAt: "2026-04-04T16:45:00.000Z",
    replyCount: 2,
    sourceType: "feed",
  },
  {
    id: "rh-003",
    title: "Counter-IED lane validation: common training misses",
    curatorNote: "Recurring misses seen during lane validations.",
    topicSlug: "counter-ied",
    topicName: "Counter IED",
    subtopic: "Route Clearance",
    tags: ["C-IED", "TTPs", "After Action"],
    author: "Master Trainer",
    createdAt: "2026-03-29T06:35:00.000Z",
    lastActivityAt: "2026-04-03T11:25:00.000Z",
    replyCount: 1,
    sourceType: "feed",
  },
];

export const rabbitholeReplies: RabbitholeReply[] = [
  {
    id: "rr-001",
    threadId: "rh-001",
    author: "EOD Analyst",
    body: "Observed drift + abrupt altitude corrections within 4-6 seconds after signal quality degradation.",
    createdAt: "2026-04-05T15:10:00.000Z",
  },
  {
    id: "rr-002",
    threadId: "rh-001",
    author: "RF Team",
    body: "Correlated with intermittent C/N0 anomalies in two captures. We should standardize export format.",
    createdAt: "2026-04-05T17:02:00.000Z",
  },
  {
    id: "rr-003",
    threadId: "rh-002",
    author: "Lab Lead",
    body: "Add tamper-seal photo requirement before handoff. Missing that in several submissions.",
    createdAt: "2026-04-04T09:50:00.000Z",
  },
];

export const tagSynonyms: Record<string, string[]> = {
  uas: ["unmanned aerial systems", "uav", "drone systems"],
  "counter-uas": ["c-uas", "cuas", "counter unmanned aerial systems"],
  cuas: ["counter-uas", "counter unmanned aerial systems", "c-uas"],
  garmin: ["gnss", "gpsnav", "gps spoofing"],
};
