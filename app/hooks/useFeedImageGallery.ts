"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useFeedImageGallery() {
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const galleryImagesRef = useRef<string[]>([]);

  galleryImagesRef.current = galleryImages;

  const openGallery = useCallback((images: string[], startIndex: number) => {
    if (images.length === 0) return;
    galleryImagesRef.current = images;
    setGalleryImages(images);
    setGalleryIndex(Math.min(Math.max(startIndex, 0), images.length - 1));
    setIsGalleryOpen(true);
  }, []);

  const closeGallery = useCallback(() => {
    setIsGalleryOpen(false);
  }, []);

  const showPrevGalleryImage = useCallback(() => {
    setGalleryIndex((prev) => {
      const len = galleryImagesRef.current.length;
      if (len <= 1) return prev;
      return prev === 0 ? len - 1 : prev - 1;
    });
  }, []);

  const showNextGalleryImage = useCallback(() => {
    setGalleryIndex((prev) => {
      const len = galleryImagesRef.current.length;
      if (len <= 1) return prev;
      return prev === len - 1 ? 0 : prev + 1;
    });
  }, []);

  useEffect(() => {
    if (!isGalleryOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      const len = galleryImagesRef.current.length;
      if (event.key === "Escape") {
        event.preventDefault();
        setIsGalleryOpen(false);
        return;
      }
      if (len <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setGalleryIndex((prev) => (prev === 0 ? len - 1 : prev - 1));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setGalleryIndex((prev) => (prev === len - 1 ? 0 : prev + 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isGalleryOpen]);

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
