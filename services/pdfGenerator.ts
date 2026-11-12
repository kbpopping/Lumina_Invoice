import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { BusinessProfile, Invoice, InvoiceItem } from '../types';
import { InvoicePreview } from '../components/InvoicePreview';

export interface InvoicePageSlice {
  items: InvoiceItem[];
  isFirstPage: boolean;
  isLastPage: boolean;
  pageNumber: number;
  totalPages: number;
}

const A4_WIDTH_PX = 794;  // 210mm at 96dpi
const A4_HEIGHT_PX = 1122; // 297mm at 96dpi

/**
 * Splits invoice items strictly according to the <= 8 items single-page rule:
 * - If items <= 8: strictly 1 page containing all details, items, totals, bank info, and notes.
 * - If items > 8: Page 1 gets 8 items; subsequent pages get up to 12 items each, with totals/bank info on the last page.
 */
export function paginateInvoiceItems(items: InvoiceItem[]): InvoicePageSlice[] {
  if (!items || items.length <= 8) {
    return [
      {
        items: items || [],
        isFirstPage: true,
        isLastPage: true,
        pageNumber: 1,
        totalPages: 1,
      },
    ];
  }

  const pages: InvoiceItem[][] = [];
  pages.push(items.slice(0, 8));

  const remaining = items.slice(8);
  const subsequentChunkSize = 12;
  for (let i = 0; i < remaining.length; i += subsequentChunkSize) {
    pages.push(remaining.slice(i, i + subsequentChunkSize));
  }

  const totalPages = pages.length;
  return pages.map((chunk, index) => ({
    items: chunk,
    isFirstPage: index === 0,
    isLastPage: index === totalPages - 1,
    pageNumber: index + 1,
    totalPages,
  }));
}

function collectDocumentStyles(): string {
  const styleParts: string[] = [];
  document.querySelectorAll('style').forEach((styleEl) => {
    styleParts.push(styleEl.outerHTML);
  });
  document.querySelectorAll('link[rel="stylesheet"]').forEach((linkEl) => {
    const href = (linkEl as HTMLLinkElement).href;
    if (href && !href.includes('fonts.googleapis.com')) {
      styleParts.push(`<link rel="stylesheet" href="${href}" />`);
    }
  });
  try {
    Array.from(document.styleSheets).forEach((sheet) => {
      if (sheet.href && sheet.href.startsWith(window.location.origin)) {
        try {
          const rules = Array.from(sheet.cssRules || [])
            .map((r) => r.cssText)
            .join('\n');
          if (rules) {
            styleParts.push(`<style>${rules}</style>`);
          }
        } catch {
          // Ignore unreadable stylesheet
        }
      }
    });
  } catch {
    // Ignore styleSheets iteration errors
  }
  return styleParts.join('\n');
}

async function waitForImagesAndFonts(doc: Document): Promise<void> {
  try {
    if ((doc as any).fonts && (doc as any).fonts.ready) {
      await Promise.race([
        (doc as any).fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
  } catch {
    // Ignore font readiness errors
  }

  const images = Array.from(doc.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const timer = setTimeout(resolve, 2500);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        })
    )
  );
}

export async function generateInvoicePDF(
  profile: BusinessProfile,
  invoice: Invoice
): Promise<void> {
  const slices = paginateInvoiceItems(invoice.items || []);

  // Create an isolated same-origin iframe whose viewport is EXACTLY A4 width (794px)
  // so html2canvas coordinates always start at (0, 0) with zero horizontal shift or left cutoff.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-12000px';
  iframe.style.top = '0';
  iframe.style.width = `${A4_WIDTH_PX}px`;
  iframe.style.height = `${A4_HEIGHT_PX}px`;
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.backgroundColor = '#ffffff';

  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Could not initialize PDF rendering frame');
    }

    const parentStyles = collectDocumentStyles();
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    ${parentStyles}
    <style>
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${A4_WIDTH_PX}px !important;
        background: #ffffff !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        -webkit-font-smoothing: antialiased;
      }
      .pdf-page-sheet {
        width: ${A4_WIDTH_PX}px;
        height: ${A4_HEIGHT_PX}px;
        background: #ffffff;
        position: relative;
        overflow: hidden;
        margin: 0 auto;
        padding: 0;
      }
      .pdf-page-inner {
        width: ${A4_WIDTH_PX}px;
        min-height: ${A4_HEIGHT_PX}px;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <div id="pdf-pages-root"></div>
  </body>
</html>`);
    iframeDoc.close();

    const mountNode = iframeDoc.getElementById('pdf-pages-root');
    if (!mountNode) {
      throw new Error('Could not find PDF mount container');
    }

    const root = createRoot(mountNode);
    root.render(
      React.createElement(
        React.Fragment,
        null,
        slices.map((slice) =>
          React.createElement(
            'div',
            {
              key: slice.pageNumber,
              className: 'pdf-page-sheet',
              'data-pdf-page': slice.pageNumber,
            },
            React.createElement(
              'div',
              { className: 'pdf-page-inner' },
              React.createElement(InvoicePreview, {
                profile,
                invoice,
                itemsOverride: slice.items,
                isFirstPage: slice.isFirstPage,
                isLastPage: slice.isLastPage,
                pageNumber: slice.pageNumber,
                totalPages: slice.totalPages,
                isPdfExport: true,
              })
            )
          )
        )
      )
    );

    // Wait a tick for React commit + Tailwind styles + images/fonts
    await new Promise((resolve) => setTimeout(resolve, 180));
    await waitForImagesAndFonts(iframeDoc);

    const pageSheets = Array.from(
      iframeDoc.querySelectorAll<HTMLElement>('.pdf-page-sheet')
    );

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pageSheets.length; i++) {
      const sheet = pageSheets[i];
      const inner = sheet.querySelector<HTMLElement>('.pdf-page-inner');

      // Guarantee that each page's content (especially <= 8 items single page)
      // fits cleanly inside the exact 1122px height without clipping or spillover.
      if (inner) {
        const naturalHeight = inner.scrollHeight;
        if (naturalHeight > A4_HEIGHT_PX) {
          const scaleFactor = (A4_HEIGHT_PX - 8) / naturalHeight;
          inner.style.transformOrigin = 'top center';
          inner.style.transform = `scale(${scaleFactor})`;
          inner.style.height = `${naturalHeight}px`;
        } else {
          inner.style.height = `${A4_HEIGHT_PX}px`;
        }
      }

      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        windowWidth: A4_WIDTH_PX,
        windowHeight: A4_HEIGHT_PX,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }

    root.unmount();

    const isPaid = invoice.status === 'paid';
    const filename = `${isPaid ? 'Receipt' : 'Invoice'}_${invoice.number || '000'}.pdf`;
    pdf.save(filename);
  } finally {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}
