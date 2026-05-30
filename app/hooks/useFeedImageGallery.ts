"use client";

import { useCallback, useEffect, useState } from "react";

export function useFeedImageGallery() {
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const openGallery = useCallback((images: string[], startIndex: number) => {
    if (images.length === 0) return;
    setGalleryImages(images);
    setGalleryIndex(Math.min(Math.max(startIndex, 0), images.length - 1));
    setIsGalleryOpen(true);
  }, []);

  const closeGallery = useCallback(() => {
    setIsGalleryOpen(false);
  }, []);

  const showPrevGalleryImage = useCallback(() => {
    setGalleryIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
  }, [galleryImages.length]);

  const showNextGalleryImage = useCallback(() => {
    setGalleryIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
  }, [galleryImages.length]);

  useEffect(() => {
    if (!isGalleryOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsGalleryOpen(false);
        return;
      }
      if (event.key === "ArrowLeft") {
        setGalleryIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
        return;
      }
      if (event.key === "ArrowRight") {
        setGalleryIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGalleryOpen, galleryImages.length]);

  return {
    galleryImages,
    galleryIndex,
    isGalleryOpen,
    openGallery,
    closeGallery,
    showPrevGalleryImage,
    showNextGalleryImage,
  };
}
