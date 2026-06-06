import type { UrlPreview } from "./urlPreview";

export type FetchUrlPreviewResult = {
  preview: UrlPreview | null;
  error: string | null;
};

/** Fetch Open Graph / page metadata for a URL via /api/preview-url. */
export async function fetchUrlPreview(
  url: string,
  accessToken: string,
): Promise<FetchUrlPreviewResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { preview: null, error: null };
  }

  try {
    const res = await fetch("/api/preview-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url: trimmed }),
    });
    const json = (await res.json().catch(() => null)) as
      | (UrlPreview & { error?: string })
      | { error?: string }
      | null;

    if (!res.ok || !json || !("url" in json)) {
      const msg =
        json && "error" in json && typeof json.error === "string"
          ? json.error
          : "Could not load URL preview.";
      return { preview: null, error: msg };
    }

    return {
      preview: {
        url: json.url,
        title: json.title ?? null,
        description: json.description ?? null,
        image: json.image ?? null,
        siteName: json.siteName ?? null,
      },
      error: null,
    };
  } catch (err) {
    return {
      preview: null,
      error: err instanceof Error ? err.message : "Could not load URL preview.",
    };
  }
}
