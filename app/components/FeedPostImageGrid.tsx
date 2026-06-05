"use client";

import { FeedMediaAttachment } from "./FeedMediaAttachment";
import {
  FEED_MEDIA_FRAME_BG,
  FEED_MEDIA_GRID_GAP,
  FEED_MEDIA_RADIUS,
  FEED_POST_IMAGES_MAX_WIDTH,
  FEED_SECTION_GAP,
  feedContainedImageStyle,
  feedSingleImageStyle,
} from "../lib/feedLayout";

type Props = {
  imageUrls: string[];
  onOpenGallery: (startIndex: number) => void;
  borderColor: string;
  maxWidth?: string;
};

export default function FeedPostImageGrid({
  imageUrls,
  onOpenGallery,
  borderColor,
  maxWidth = FEED_POST_IMAGES_MAX_WIDTH,
}: Props) {
  if (imageUrls.length === 0) return null;

  const visibleImages = imageUrls.slice(0, 3);
  const remainingCount = imageUrls.length - 3;

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
      {visibleImages.map((url, index) => {
        const showOverlay = index === 2 && remainingCount > 0;
        const isSingleImage = visibleImages.length === 1;

        return (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => onOpenGallery(index)}
            style={{
              position: "relative",
              borderRadius: FEED_MEDIA_RADIUS,
              overflow: "hidden",
              border: isSingleImage ? "none" : `1px solid ${borderColor}`,
              background: FEED_MEDIA_FRAME_BG,
              aspectRatio: isSingleImage ? undefined : "1 / 1",
              padding: 0,
              cursor: "pointer",
              width: "100%",
            }}
          >
            <FeedMediaAttachment
              url={url}
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
