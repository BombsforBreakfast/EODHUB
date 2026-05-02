export function scrapbookHttpsUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

/** Extract YouTube video id for thumbnails and embeds. */
export function youtubeVideoIdFromUrl(externalUrl: string): string | null {
  const raw = externalUrl.trim();
  if (!raw) return null;
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./i, "").replace(/^m\./i, "");
    if (!host.includes("youtube.com") && !host.includes("youtube-nocookie.com") && host !== "youtu.be") return null;

    let id: string | null = null;
    if (host === "youtu.be") {
      id = u.pathname.split("/").filter(Boolean)[0]?.split("?")[0] ?? null;
    } else if (u.pathname.startsWith("/watch")) {
      id = u.searchParams.get("v");
    } else if (u.pathname.startsWith("/embed/")) {
      id = u.pathname.split("/")[2]?.split("?")[0] ?? null;
    } else if (u.pathname.startsWith("/shorts/")) {
      id = u.pathname.split("/")[2]?.split("?")[0] ?? null;
    } else if (u.pathname.startsWith("/v/")) {
      id = u.pathname.split("/")[2]?.split("?")[0] ?? null;
    }

    if (!id || !/^[a-zA-Z0-9_-]{6,}$/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

/** Standard YouTube still image when we don't have an OG thumbnail stored. */
export function youtubeVideoThumbUrl(externalUrl: string): string | null {
  const id = youtubeVideoIdFromUrl(externalUrl);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

/** Small site icon for link cards (Google favicon service). */
export function googleFaviconUrl(externalUrl: string): string {
  try {
    const raw = externalUrl.trim();
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./i, "") || "example.com";
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`;
  } catch {
    return "https://www.google.com/s2/favicons?sz=64&domain=example.com";
  }
}

/** Host + path snippet for scrapbook article thumbnails when OG image is missing. */
export function articleLinkThumbParts(externalUrl: string): { site: string; pathSnippet: string } {
  const raw = externalUrl.trim();
  if (!raw) return { site: "Article", pathSnippet: "" };
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(normalized);
    const site = u.hostname.replace(/^www\./i, "") || "Link";
    let path = `${u.pathname}${u.search}`.replace(/\/+$/, "");
    if (!path || path === "/") return { site, pathSnippet: "(homepage)" };
    if (path.startsWith("/")) path = path.slice(1);
    if (path.length > 52) path = `${path.slice(0, 50)}…`;
    return { site, pathSnippet: path };
  } catch {
    const fallback = raw.replace(/^https?:\/\//i, "");
    return {
      site: "Link",
      pathSnippet: fallback.length > 56 ? `${fallback.slice(0, 54)}…` : fallback,
    };
  }
}

/** Short label under scrapbook thumbnails (preview strip + gallery viewer). */
export function scrapbookThumbKindLabel(item: {
  item_type: "photo" | "article" | "document" | "memory";
  external_url: string | null;
}): string {
  switch (item.item_type) {
    case "photo":
      return "Photo";
    case "document":
      return "Document";
    case "memory":
      return "Story";
    case "article": {
      const raw = item.external_url?.trim() ?? "";
      if (raw && youtubeVideoIdFromUrl(raw)) return "Video";
      return "Article";
    }
    default:
      return "Item";
  }
}

export function profileDisplayName(p: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const d = p.display_name?.trim();
  if (d) return d;
  const fn = p.first_name?.trim() ?? "";
  const ln = p.last_name?.trim() ?? "";
  const full = `${fn} ${ln}`.trim();
  return full || "Member";
}
