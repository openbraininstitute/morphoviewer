import type { MorphoViewerSnapshotOptions } from "./signals";

/**
 * the raw capture from `context.takeSnapshot()` is always a png, when a lossy
 * type (webp/jpeg) or quality is requested, redraw it onto a 2d canvas and
 * re-encode.
 */
export async function reencodeSnapshot(
  image: HTMLImageElement | null,
  options?: MorphoViewerSnapshotOptions
): Promise<HTMLImageElement | null> {
  const type = options?.type;
  if (!image || !type || type === "image/png") return image;

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return image;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;

  ctx.drawImage(image, 0, 0, width, height);
  const url = canvas.toDataURL(type, options?.quality);

  const out = new Image();
  out.width = width;
  out.height = height;
  await new Promise<void>((resolve) => {
    out.onload = () => resolve();
    out.onerror = () => resolve();
    out.src = url;
  });

  if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
  return out;
}
