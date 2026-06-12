/**
 * USAJobs intake channels — parallel strategies beyond a single keyword list.
 *
 * The API `Keyword` parameter matches title + body, but the legacy importer only
 * kept rows whose *title* contained EOD terms. These channels add occupational
 * series, agency, and position-title passes so good listings are not dropped.
 */

export type USAJobsKeywordChannel = {
  id: string;
  keyword: string;
  maxPages: number;
  datePosted: number;
};

export type USAJobsSeriesChannel = {
  id: string;
  jobCategoryCode: string;
  /** Optional narrow filter; omit to fetch the series and score in-app. */
  keyword?: string;
  maxPages: number;
  datePosted: number;
};

export type USAJobsOrganizationChannel = {
  id: string;
  organization: string;
  keyword?: string;
  maxPages: number;
  datePosted: number;
};

export type USAJobsTitleChannel = {
  id: string;
  positionTitle: string;
  maxPages: number;
  datePosted: number;
};

export const USAJOBS_RESULTS_PER_PAGE = 25;

/** API supports DatePosted 0–60 days. */
export const USAJOBS_DEFAULT_DATE_POSTED = 60;

/** Primary keyword searches (title + announcement body on USAJobs' side). */
export const USAJOBS_KEYWORD_CHANNELS: USAJobsKeywordChannel[] = [
  { id: "kw:eod-core", keyword: "Explosive Ordnance Disposal", maxPages: 4, datePosted: 60 },
  { id: "kw:uxo", keyword: "unexploded ordnance OR UXO technician", maxPages: 3, datePosted: 60 },
  { id: "kw:bomb", keyword: "bomb technician OR bomb squad OR hazardous devices", maxPages: 3, datePosted: 60 },
  { id: "kw:cied", keyword: "C-IED OR CIED OR improvised explosive device", maxPages: 3, datePosted: 60 },
  { id: "kw:cbrn", keyword: "CBRN OR CBRNE OR chemical biological radiological", maxPages: 2, datePosted: 60 },
  { id: "kw:explosive-safety", keyword: "explosive safety OR explosives specialist", maxPages: 3, datePosted: 60 },
  { id: "kw:ordnance", keyword: "ordnance disposal OR ammunition OR munitions", maxPages: 3, datePosted: 60 },
  { id: "kw:uas", keyword: "UAS OR unmanned aerial OR C-UAS OR counter UAS", maxPages: 2, datePosted: 60 },
  { id: "kw:tss-e", keyword: "Transportation Security Specialist Explosives OR TSS-E", maxPages: 2, datePosted: 60 },
  { id: "kw:em", keyword: "Emergency Management Specialist", maxPages: 3, datePosted: 60 },
  { id: "kw:nmc", keyword: "Nuclear Materials Courier", maxPages: 2, datePosted: 60 },
];

/**
 * Occupational series (JobCategoryCode) — roles that rarely say EOD in the title.
 * 0017 = Explosives Safety; 0089 = Emergency Management Specialist.
 */
export const USAJOBS_SERIES_CHANNELS: USAJobsSeriesChannel[] = [
  { id: "series:0017", jobCategoryCode: "0017", maxPages: 3, datePosted: 60 },
  { id: "series:0017-ordnance", jobCategoryCode: "0017", keyword: "ordnance OR explosive OR ammunition", maxPages: 2, datePosted: 60 },
  { id: "series:0089", jobCategoryCode: "0089", maxPages: 3, datePosted: 60 },
  { id: "series:0089-preparedness", jobCategoryCode: "0089", keyword: "preparedness OR continuity OR disaster", maxPages: 2, datePosted: 60 },
];

/**
 * Agency filters — catch generic titles from departments that post EOD/EM roles.
 * AR = Army; HS = DHS; IN = Interior; TR = Treasury; NV = Navy.
 */
export const USAJOBS_ORGANIZATION_CHANNELS: USAJobsOrganizationChannel[] = [
  { id: "org:ar-eod", organization: "AR", keyword: "ordnance OR explosive OR EOD OR UXO OR ammunition", maxPages: 2, datePosted: 60 },
  { id: "org:hs-security", organization: "HS", keyword: "explosive OR ordnance OR TSS OR emergency management", maxPages: 2, datePosted: 60 },
  { id: "org:nv-eod", organization: "NV", keyword: "ordnance OR explosive OR EOD OR UXO", maxPages: 2, datePosted: 60 },
  { id: "org:tr-courier", organization: "TR", keyword: "nuclear OR courier OR explosive", maxPages: 2, datePosted: 60 },
  { id: "org:in-uxo", organization: "IN", keyword: "UXO OR unexploded OR ordnance OR explosive", maxPages: 2, datePosted: 60 },
];

/** PositionTitle parameter — direct title search when Keyword matching is too broad. */
export const USAJOBS_TITLE_CHANNELS: USAJobsTitleChannel[] = [
  { id: "title:em-specialist", positionTitle: "Emergency Management Specialist", maxPages: 3, datePosted: 60 },
  { id: "title:eod", positionTitle: "Explosive Ordnance Disposal", maxPages: 3, datePosted: 60 },
  { id: "title:explosives-safety", positionTitle: "Explosives Safety", maxPages: 2, datePosted: 60 },
  { id: "title:tss", positionTitle: "Transportation Security Specialist", maxPages: 2, datePosted: 60 },
];
