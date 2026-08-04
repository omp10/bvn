import PDFDocument from "pdfkit";
import type { Response } from "express";

export type PdfColumn<T> = { header: string; width: number; cell: (row: T) => string };

const BRAND = "#1155a5";
const LEAF = "#45ab35";
const INK = "#0f172a";
const MUTED = "#64748b";

/**
 * Streams a table as a PDF.
 *
 * Streamed rather than buffered: a year of trip records should not sit in
 * memory before the first byte reaches the browser.
 */
export function streamTablePdf<T>({
  res,
  filename,
  title,
  subtitle,
  columns,
  rows,
  summary,
}: {
  res: Response;
  filename: string;
  title: string;
  subtitle?: string;
  columns: PdfColumn<T>[];
  rows: T[];
  summary?: string[];
}): void {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  const header = () => {
    doc.fillColor(BRAND).fontSize(18).font("Helvetica-Bold").text("BalVahini", left, 32, { continued: true });
    doc.fillColor(LEAF).text("  Safe Journeys, Brighter Futures", { align: "left" });

    doc.moveDown(0.4);
    doc.fillColor(INK).fontSize(14).font("Helvetica-Bold").text(title);
    if (subtitle) doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(subtitle);

    doc.moveDown(0.6);
    tableHeader();
  };

  const tableHeader = () => {
    const y = doc.y;
    doc.rect(left, y - 2, right - left, 18).fill("#eef5fd");

    let x = left + 4;
    doc.fillColor(BRAND).fontSize(8).font("Helvetica-Bold");
    for (const column of columns) {
      doc.text(column.header.toUpperCase(), x, y + 3, { width: column.width - 8, ellipsis: true });
      x += column.width;
    }
    doc.y = y + 20;
  };

  header();

  doc.font("Helvetica").fontSize(9);
  for (const [index, row] of rows.entries()) {
    // Leave room for the footer; start a fresh page with repeated headings.
    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      header();
      doc.font("Helvetica").fontSize(9);
    }

    const y = doc.y;
    if (index % 2 === 1) doc.rect(left, y - 3, right - left, 16).fill("#f8fafc");

    let x = left + 4;
    doc.fillColor(INK);
    for (const column of columns) {
      doc.text(column.cell(row) ?? "", x, y, { width: column.width - 8, ellipsis: true, lineBreak: false });
      x += column.width;
    }
    doc.y = y + 16;
  }

  if (!rows.length) {
    doc.moveDown().fillColor(MUTED).text("No records for this period.");
  }

  if (summary?.length) {
    doc.moveDown(1).fillColor(INK).fontSize(10).font("Helvetica-Bold");
    for (const line of summary) doc.text(line);
  }

  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica")
    .text(
      `Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} record${rows.length === 1 ? "" : "s"}`,
      left,
      doc.page.height - 40,
      { width: right - left, align: "right" }
    );

  doc.end();
}
