"use client";

import { Play } from "lucide-react";
import {
  FEED_MEDIA_FRAME_BG,
  FEED_POST_IMAGES_MAX_WIDTH,
  feedContainedImageStyle,
} from "../lib/feedLayout";
import { isVideoUrl } from "../lib/uploadLimits";

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
        marginTop: 12,
        display: "grid",
        gridTemplateColumns:
          visibleImages.length === 1
            ? "1fr"
            : visibleImages.length === 2
              ? "repeat(2, minmax(0, 1fr))"
              : "repeat(3, minmax(0, 1fr))",
        gap: "clamp(6px, 1.8vw, 10px)",
        width: "100%",
        maxWidth,
        boxSizing: "border-box",
      }}
    >
      {visibleImages.map((url, index) => {
        const showOverlay = index === 2 && remainingCount > 0;

        return (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => onOpenGallery(index)}
            style={{
              position: "relative",
              borderRadius: 12,
              overflow: "hidden",
              border: `1px solid ${borderColor}`,
              background: FEED_MEDIA_FRAME_BG,
              aspectRatio: "1 / 1",
              padding: 0,
              cursor: "pointer",
            }}
          >
            {isVideoUrl(url) ? (
              <>
                <video
                  src={url}
                  preload="metadata"
                  muted
                  playsInline
                  style={feedContainedImageStyle}
                />
                {!showOverlay && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(0,0,0,0.5)",
                        borderRadius: "50%",
                        width: 38,
                        height: 38,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Play size={16} color="white" fill="white" />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <img
                src={url}
                alt={`Post image ${index + 1}`}
                style={feedContainedImageStyle}
              />
            )}

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
