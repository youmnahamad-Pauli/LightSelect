/**
 * ZIP bundle generator — Priority 17.
 *
 * Bundles the XLSX and PDF artifacts into a single archive for consultant download.
 *
 * Future additions (without interface changes):
 *   - Manufacturer PDFs from linked project_files
 *   - Cover page HTML/print-ready variant
 *   - Per-section subfolder structure
 */
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ZipInput {
  /** Used for the README project label and for directory resolution. */
  projectName: string;
  /** Absolute on-disk path to the XLSX artifact (null → skip). */
  xlsxAbsPath: string | null;
  /** Absolute on-disk path to the PDF artifact (null → skip). */
  pdfAbsPath: string | null;
  /** Absolute path where the ZIP should be written. */
  outputAbsPath: string;
}

export interface ZipResult {
  /** Byte length of the written ZIP. */
  sizeBytes: number;
}

// ─── README content ───────────────────────────────────────────────────────

function buildReadme(projectName: string, timestamp: string): string {
  return [
    'LightSelect Export Bundle',
    `Generated: ${timestamp}`,
    `Project:   ${projectName}`,
    '',
    'Contents',
    '--------',
    'boq-schedule.xlsx       Bill of Quantities workbook (BOQ schedule + project summary)',
    'package-summary.pdf     Package overview (readiness, sections, BOQ overview)',
    '',
    'Note',
    '----',
    'Linked manufacturer datasheets and specification documents can be added',
    'to this bundle in a future release of LightSelect.',
    '',
    'This file was generated automatically. Do not edit.',
  ].join('\n');
}

// ─── Generator ────────────────────────────────────────────────────────────

/**
 * Builds the ZIP and writes it to `input.outputAbsPath`.
 * Skips files whose `absPath` is null or that do not exist on disk.
 * Always includes a README.txt explaining the bundle contents.
 *
 * @throws if archiver reports a fatal error
 */
export async function generateExportZip(input: ZipInput): Promise<ZipResult> {
  const { projectName, xlsxAbsPath, pdfAbsPath, outputAbsPath } = input;

  const timestamp = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return new Promise<ZipResult>((resolve, reject) => {
    const output = fs.createWriteStream(outputAbsPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    let writtenBytes = 0;

    output.on('close', () => resolve({ sizeBytes: writtenBytes }));
    output.on('finish', () => { writtenBytes = output.bytesWritten; });
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(output);

    // ── XLSX ────────────────────────────────────────────────────────────────
    if (xlsxAbsPath && fs.existsSync(xlsxAbsPath)) {
      archive.file(xlsxAbsPath, { name: 'boq-schedule.xlsx' });
    }

    // ── PDF ─────────────────────────────────────────────────────────────────
    if (pdfAbsPath && fs.existsSync(pdfAbsPath)) {
      archive.file(pdfAbsPath, { name: 'package-summary.pdf' });
    }

    // ── README ──────────────────────────────────────────────────────────────
    archive.append(buildReadme(projectName, timestamp), { name: 'README.txt' });

    archive.finalize();
  });
}
