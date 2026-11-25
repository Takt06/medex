export function buildOlongapoSampleRxSvg(patientName = 'Claire Santos', medicineName = 'Amoxicillin 500mg Capsules (#14)'): string {
  const safePatient = patientName.replace(/[<>]/g, '');
  const safeMed = medicineName.replace(/[<>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="380" viewBox="0 0 640 380">
    <rect width="640" height="380" rx="12" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/>
    <rect x="0" y="0" width="640" height="68" rx="12" fill="#0F172A"/>
    <text x="32" y="34" font-family="sans-serif" font-size="18" font-weight="bold" fill="#FFFFFF">OLONGAPO CITY MEDICAL CLINIC — Rx</text>
    <text x="32" y="54" font-family="sans-serif" font-size="11" fill="#5EEAD4">Rizal Avenue, East Bajac-Bajac, Olongapo City, Zambales</text>
    <text x="32" y="102" font-family="sans-serif" font-size="13" fill="#334155">Patient: ${safePatient}   |   Date Issued: 2026-11-13</text>
    <line x1="32" y1="116" x2="608" y2="116" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="32" y="168" font-family="serif" font-size="38" font-weight="bold" fill="#0D9488">Rx</text>
    <text x="96" y="164" font-family="sans-serif" font-size="16" font-weight="700" fill="#0F172A">${safeMed}</text>
    <text x="96" y="190" font-family="sans-serif" font-size="13" fill="#475569">Sig: Take as directed by attending physician · Verified Valid Rx</text>
    <rect x="32" y="232" width="576" height="1" fill="#E2E8F0"/>
    <text x="32" y="274" font-family="sans-serif" font-size="13" font-weight="600" fill="#0F172A">Prescribing Physician: Dr. Josefa Navarro, MD</text>
    <text x="32" y="298" font-family="monospace" font-size="12" fill="#475569">PRC License No.: PRC-0114892   |   PTR No.: 8841203</text>
    <rect x="448" y="260" width="160" height="48" rx="8" fill="#CCFBF1" stroke="#0D9488" stroke-width="1.5"/>
    <text x="528" y="283" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0F766E">PHYSICIAN SIGNED</text>
    <text x="528" y="299" text-anchor="middle" font-family="monospace" font-size="10" fill="#115E59">OLONGAPO VERIFIED</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function readPrescriptionFile(
  file: File
): Promise<{ ok: true; fileName: string; fileType: 'jpg' | 'png' | 'pdf'; previewUrl: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (file.size > 10 * 1024 * 1024) {
      resolve({ ok: false, error: 'Prescription file must be 10 MB or smaller.' });
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validType: 'jpg' | 'png' | 'pdf' | null =
      ext === 'jpg' || ext === 'jpeg'
        ? 'jpg'
        : ext === 'png'
          ? 'png'
          : ext === 'pdf'
            ? 'pdf'
            : null;
    if (!validType) {
      resolve({ ok: false, error: 'Unsupported file format. Upload a JPG, PNG, or PDF document.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        ok: true,
        fileName: file.name,
        fileType: validType,
        previewUrl: typeof reader.result === 'string' ? reader.result : '',
      });
    };
    reader.onerror = () => {
      resolve({ ok: false, error: 'Failed to read prescription file from device.' });
    };
    reader.readAsDataURL(file);
  });
}
