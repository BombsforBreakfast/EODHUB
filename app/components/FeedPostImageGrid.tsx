"use client";

import { FeedMediaAttachment } from "./FeedMediaAttachment";
import type { PostAttachment } from "../lib/postAttachments";
import {
  FEED_MEDIA_FRAME_BG,
  FEED_MEDIA_GRID_GAP,
  FEED_MEDIA_RADIUS,
  FEED_POST_IMAGES_MAX_WIDTH,
  FEED_SECTION_GAP,
  feedContainedImageStyle,
  feedSingleImageStyle,
  feedSingleMediaFrameStyle,
} from "../lib/feedLayout";

type Props = {
  attachments: PostAttachment[];
  onOpenGallery: (startIndex: number) => void;
  borderColor: string;
  maxWidth?: string;
};

export default function FeedPostImageGrid({
  attachments,
  onOpenGallery,
  borderColor,
  maxWidth = FEED_POST_IMAGES_MAX_WIDTH,
}: Props) {
  if (attachments.length === 0) return null;

  const visibleImages = attachments.slice(0, 3);
  const remainingCount = attachments.length - 3;
  const galleryItems = attachments.filter((item) => item.kind === "image" || item.kind === "video");

  return (
    <div
      style={{
        marginTop: FEED_SECTION_GAP,
        display: "grid",
        gridTemplateColumns:
          visibleImages.length === 1
            ? "1fr"
            : visibleImages.length === 2
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(3, minmax(0, 1fr))",
        gap: FEED_MEDIA_GRID_GAP,
        width: "100%",
        maxWidth,
        boxSizing: "border-box",
      }}
    >
      {visibleImages.map((attachment, index) => {
        const showOverlay = index === 2 && remainingCount > 0;
        const isSingleImage = visibleImages.length === 1;
        const isGalleryItem = attachment.kind === "image" || attachment.kind === "video";
        const galleryStartIndex = isGalleryItem
          ? galleryItems.findIndex((item) => item.url === attachment.url && item.renderUrl === attachment.renderUrl)
          : -1;

        return (
          <button
            key={`${attachment.url}-${index}`}
            type="button"
            onClick={() => {
              if (isGalleryItem && galleryStartIndex >= 0) {
                onOpenGallery(galleryStartIndex);
                return;
              }
              if (typeof window !== "undefined") {
                window.open(attachment.url, "_blank", "noopener,noreferrer");
              }
            }}
            style={{
              ...(isSingleImage
                ? feedSingleMediaFrameStyle
                : {
                    position: "relative",
                    borderRadius: FEED_MEDIA_RADIUS,
                    overflow: "hidden",
                    background: FEED_MEDIA_FRAME_BG,
                    aspectRatio: "1 / 1",
                  }),
              border: isSingleImage ? "none" : `1px solid ${borderColor}`,
              padding: 0,
              cursor: "pointer",
              width: "100%",
            }}
          >
            <FeedMediaAttachment
              attachment={attachment}
              alt={`Post image ${index + 1}`}
              style={isSingleImage ? feedSingleImageStyle : feedContainedImageStyle}
            />

            {showOverlay && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: 24,
                  fontWeight: 800,
                }}
              >
                +{remainingCount}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
