/**
 * Fetches a PDF from an internal API URL and shares it via the Web Share API.
 * Falls back to a browser download if sharing is not supported.
 *
 * Returns:
 *  "shared"     → file shared via Web Share API (native share sheet)
 *  "downloaded" → fallback: file saved to disk
 *  "cancelled"  → user dismissed the share sheet
 *  "error"      → fetch failed
 */
export async function sharePdf(
  pdfUrl: string,
  filename: string,
): Promise<"shared" | "downloaded" | "cancelled" | "error"> {
  let blob: Blob;
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return "error";
    blob = await res.blob();
  } catch {
    return "error";
  }

  const file = new File([blob], filename, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
      // share failed for unexpected reason — fall through to download
    }
  }

  // Fallback: trigger browser download
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  return "downloaded";
}
