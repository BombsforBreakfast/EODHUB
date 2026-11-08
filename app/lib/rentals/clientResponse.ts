/** Hosting errors may be plain text or HTML rather than our JSON API contract. */
export async function readRentalResponse(response: Response) {
  let raw: string;
  try { raw = await response.text(); }
  catch { throw new Error("The connection was interrupted. Keep this page open and try again."); }
  let result;
  try { result = JSON.parse(raw); } catch { /* Handle infrastructure responses below. */ }
  if (!response.ok) {
    if (response.status === 413) throw new Error("This photo is too large to upload. Choose the original again so we can resize it, or try a smaller JPG.");
    if (typeof result?.error === "string") throw new Error(result.error);
    if (response.status === 401 || response.status === 403) throw new Error("Your session may have expired. Save your work and sign in again.");
    if (response.status === 429) throw new Error("Too many attempts. Wait a few minutes, then try again.");
    throw new Error("The property portal could not complete this request. Please try again shortly.");
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("The property portal returned an incomplete response. Please try again.");
  return result;
}

export async function rentalFetch(input: RequestInfo | URL, init?: RequestInit) {
  try { return await fetch(input, init); }
  catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("Could not connect to the property portal. Check your connection and try again. Keep this page open to retain your changes.");
  }
}
