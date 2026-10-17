import type { CVProfile, ResumeHeader } from '@/types/schema';

// Local raster data only. Never fetch a legacy remote URL or embed SVG in PDF.
export function storedPhoto(header: ResumeHeader): string | undefined {
  const value = header.photoUrl;
  return value && value.length <= 500_000 && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : undefined;
}
export function visiblePhoto(profile: CVProfile) {
  const h = profile.resumeHeader.data;
  const source = h.showPhoto !== false ? storedPhoto(h) : undefined;
  return source ? { source, shape: h.photoShape ?? 'circle' } : null;
}
export type PhotoDraft = { image: CanvasImageSource; width: number; height: number; dispose: () => void };
export async function readPhoto(file: File): Promise<PhotoDraft> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137,80,78,71,13,10,26,10].every((x,i) => bytes[i] === x);
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('Choose a JPG, PNG or WebP photo. SVG and GIF are not supported.');
  let draft: PhotoDraft;
  try {
    if (typeof createImageBitmap === 'function') {
      const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
      draft = { image, width: image.width, height: image.height, dispose: () => image.close() };
    } else {
      const url = URL.createObjectURL(file); const image = new Image();
      try { image.src = url; await image.decode(); }
      finally { URL.revokeObjectURL(url); }
      draft = { image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => { image.src = ''; } };
    }
  } catch { throw new Error('This photo could not be read. Try another JPG, PNG or WebP.'); }
  if (draft.width < 64 || draft.height < 64 || draft.width > 12000 || draft.height > 12000 || draft.width * draft.height > 40_000_000) {
    draft.dispose(); throw new Error('Use a photo at least 64 × 64 pixels, up to 40 megapixels and 12,000 pixels per side.');
  }
  return draft;
}
export function paintPhoto(canvas: HTMLCanvasElement, draft: PhotoDraft, zoom: number, x: number, y: number) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo editing is unavailable in this browser. Try another browser.');
  const size = Math.min(draft.width, draft.height) / zoom;
  const left = (draft.width - size) * x / 100;
  const top = (draft.height - size) * y / 100;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(draft.image, left, top, size, size, 0, 0, canvas.width, canvas.height);
}
