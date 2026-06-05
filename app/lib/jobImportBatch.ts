/** Split an array into fixed-size chunks for batched Supabase reads/writes. */
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export const JOB_IMPORT_LOOKUP_CHUNK = 200;
export const JOB_IMPORT_WRITE_CHUNK = 50;
