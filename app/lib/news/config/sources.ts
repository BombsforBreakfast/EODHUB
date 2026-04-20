// Curated direct-feed sources. Edit freely.
//
// `weight` adds 0..5 to the relevance score of any item from this source.
// Higher weight = more trusted / more on-topic for the EOD audience.
//
// `isSatire` flags Duffel Blog and similar — those items render with a
// "Satire" badge instead of "Newswire" and use a lower relevance threshold
// (because their headlines often don't pattern-match military jargon).

export type DirectFeedSource = {
  name: string;
  url: string;
  weight: number;
  isSatire?: boolean;
};

export const DIRECT_FEEDS: DirectFeedSource[] = [
  // Defense / military trade press — high signal for EOD-adjacent stories.
  { name: "Army Times", url: "https://www.armytimes.com/arc/outboundfeeds/rss/?outputType=xml", weight: 4 },
  { name: "Defense News", url: "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml", weight: 4 },
  { name: "Military.com News", url: "https://www.military.com/rss-feeds/content?feed=news", weight: 3 },

  // Government press releases. ATF + FBI surface bomb-tech / explosives ops.
  { name: "FBI National Press", url: "https://www.fbi.gov/feeds/national-press-releases/rss.xml", weight: 5 },
  { name: "ATF Newsroom", url: "https://www.atf.gov/rss.xml", weight: 5 },
  { name: "DVIDS Top Stories", url: "https://www.dvidshub.net/rss/news", weight: 3 },

  // Satire lane — opt-in, marked separately in UI.
  { name: "Duffel Blog", url: "https://www.duffelblog.com/feed/", weight: 2, isSatire: true },
];
