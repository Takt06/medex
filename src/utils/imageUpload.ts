export const MAX_MEDICINE_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validateMedicineImageFile(file: {
  name: string;
  size: number;
  type?: string;
}): { valid: true } | { valid: false; error: string } {
  if (file.size <= 0) {
    return { valid: false, error: 'Selected image file is empty.' };
  }
  if (file.size > MAX_MEDICINE_IMAGE_BYTES) {
    return { valid: false, error: 'Medicine photo must be 8 MB or smaller.' };
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = (file.type || '').toLowerCase();
  const extOk = ALLOWED_IMAGE_EXTS.has(ext);
  const mimeOk = mime !== '' && ALLOWED_IMAGE_MIMES.has(mime);

  if (!extOk && !mimeOk) {
    return {
      valid: false,
      error: 'Unsupported image format. Attach a JPG, PNG, WebP, or GIF photo.',
    };
  }
  return { valid: true };
}

function resizeRasterDataUrl(dataUrl: string, maxDimension = 720): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const largest = Math.max(img.width, img.height);
        if (!largest || largest <= maxDimension) {
          resolve(dataUrl);
          return;
        }
        const scale = maxDimension / largest;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function readAndOptimizeMedicineImage(
  file: File
): Promise<{ ok: true; dataUrl: string; fileName: string } | { ok: false; error: string }> {
  const validation = validateMedicineImageFile(file);
  if (!validation.valid) {
    return Promise.resolve({ ok: false, error: validation.error });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      if (!raw) {
        resolve({ ok: false, error: 'Failed to read medicine image.' });
        return;
      }
      const finalUrl = await resizeRasterDataUrl(raw, 720);
      resolve({ ok: true, dataUrl: finalUrl, fileName: file.name });
    };
    reader.onerror = () => {
      resolve({ ok: false, error: 'Could not load image from your device.' });
    };
    reader.readAsDataURL(file);
  });
}
