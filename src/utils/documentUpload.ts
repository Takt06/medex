import { validateVerificationDocumentFile } from './medexRules';

export interface ProcessedDocumentResult {
  ok: boolean;
  fileName?: string;
  dataUrl?: string;
  isPdf?: boolean;
  error?: string;
}

const MAX_IMAGE_DIMENSION = 1400;
const JPEG_QUALITY = 0.82;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function compressImageFile(file: File, maxDimension = MAX_IMAGE_DIMENSION, quality = JPEG_QUALITY): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || img.width || 1;
        const naturalH = img.naturalHeight || img.height || 1;
        let targetW = naturalW;
        let targetH = naturalH;

        if (naturalW > maxDimension || naturalH > maxDimension) {
          if (naturalW >= naturalH) {
            targetW = maxDimension;
            targetH = Math.max(1, Math.round((naturalH * maxDimension) / naturalW));
          } else {
            targetH = maxDimension;
            targetW = Math.max(1, Math.round((naturalW * maxDimension) / naturalH));
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Canvas unavailable'));
          return;
        }
        // Paint white background so transparent PNGs convert cleanly to JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const compressed = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(objectUrl);
        resolve(compressed);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error('Image compression failed.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the selected image file.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Validates and safely loads a verification document (Business Permit / Gov ID)
 * or product photo. Large raster images are compressed via offscreen canvas to
 * keep UI repainting fast and avoid localStorage / payload size freezes.
 */
export async function readAndCompressVerificationDocument(
  file: File
): Promise<ProcessedDocumentResult> {
  const validation = validateVerificationDocumentFile({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!validation.valid) {
    return { ok: false, error: validation.error || 'Invalid document file.' };
  }

  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

  try {
    if (isPdf) {
      const dataUrl = await readFileAsDataUrl(file);
      return { ok: true, fileName: file.name, dataUrl, isPdf: true };
    }

    // Compress images larger than 220 KB (or any standard photo) cleanly via canvas;
    // fall back to raw FileReader if canvas decoding isn't supported (e.g. tiny synthetic test PNGs).
    if (typeof document !== 'undefined' && file.size > 150 * 1024) {
      try {
        const compressedUrl = await compressImageFile(file);
        return { ok: true, fileName: file.name, dataUrl: compressedUrl, isPdf: false };
      } catch {
        // Fallback to direct data URL below
      }
    }

    const rawDataUrl = await readFileAsDataUrl(file);
    return { ok: true, fileName: file.name, dataUrl: rawDataUrl, isPdf: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not process the selected file.',
    };
  }
}
