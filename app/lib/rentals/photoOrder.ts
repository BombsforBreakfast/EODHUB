/** Unknown/canceled drops leave the saved order intact. The first item is the cover. */
export function reorderRentalPhotos(photos: string[], source: string, target: string | null) {
  const from = photos.indexOf(source), to = target === null ? -1 : photos.indexOf(target);
  if (from < 0 || to < 0 || from === to) return photos;
  const next = [...photos];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
