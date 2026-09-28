import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { accessSync } from 'fs';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { writeExportFile, sweepStaleExportFiles } from '@/shared/lib/export/temp-files';
import { checkRateLimit, rateLimitResponse, acquireSlot } from '@/shared/lib/rate-limit';

/*
 * Os tokens de impressão de uso único (`createPrintToken`/`validatePrintToken`/
 * `consumePrintToken` + a rota /verify + o bypass `?_pt=` no AuthProvider)
 * foram removidos. Eram vestígio de um fluxo em que o Puppeteer NAVEGAVA até a
 * página; hoje o PDF sai de um snapshot via `page.setContent()` (abaixo), que
 * não passa por auth de rota nenhuma. Nada nunca chamava `createPrintToken`, o
 * mapa vivia vazio e `/verify` respondia 403 sempre — era um caminho de bypass
 * de autenticação permanentemente fechado, mas presente no código.
 */

/**
 * POST /api/export-pdf
 * Receives HTML snapshot with inlined rgb colors + unwrapped CSS stylesheets.
 * Renders in headless Chrome and generates PDF.
 */
export async function POST(req: NextRequest) {
  try {
    const email = await verifyAuthToken(req);
    if (!email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const limit = checkRateLimit(`pdf:${email}`, { limit: 5, windowMs: 60_000 });
    if (!limit.ok) {
      return rateLimitResponse(limit, 'Muitas exportações seguidas. Aguarde alguns segundos.');
    }

    const body = await req.json();
    const { html, title = 'Dashboard', styles = '' } = body as {
      html: string;
      title?: string;
      styles?: string;
    };

    if (!html) {
      return NextResponse.json({ error: 'html is required' }, { status: 400 });
    }

    const puppeteer = await import('puppeteer-core');
    const executablePath = findChrome();
    if (!executablePath) {
      return NextResponse.json(
        { error: 'Chrome não encontrado.' },
        { status: 500 },
      );
    }

    // Teto de Chrome SIMULTÂNEOS. Protege mais que a taxa: o que derruba o
    // processo não é quantas exportações por minuto, é dois navegadores abertos
    // ao mesmo tempo disputando memória. Vale para todos os usuários somados.
    const releaseSlot = acquireSlot('export-pdf', 2);
    if (!releaseSlot) {
      return NextResponse.json(
        {
          code: 'RATE_LIMITED',
          message: 'Há exportações em andamento. Tente novamente em instantes.',
          retryAfter: 15,
        },
        { status: 429, headers: { 'Retry-After': '15' } },
      );
    }

    const browser = await puppeteer.default.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });

      // Anti-SSRF: o snapshot já chega com cores inline e CSS desempacotado, então
      // nenhum recurso remoto é legítimo. Abortamos toda requisição http(s)/ftp/file
      // para impedir que HTML controlado pelo cliente force o Chrome (que roda com
      // --no-sandbox) a buscar endpoints internos/metadata. Só data:/blob:/about:.
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
          request.continue().catch(() => {});
        } else {
          request.abort().catch(() => {});
        }
      });

      const now = new Date();
      const timestamp = now.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    ${styles}
  </style>
</head>
<body style="background: #0A0B10; color: rgb(255,255,255); font-family: 'Inter', system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0;">
  <div style="padding: 16px 24px;">
    ${html}
  </div>
</body>
</html>`;

      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 15000 });
      await new Promise(r => setTimeout(r, 500));

      // Capture full-page screenshot instead of page.pdf() because
      // Chrome's print renderer doesn't support oklch()/lab() colors
      // but the screen renderer does.
      const screenshot = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 92 });
      const imgBase64 = Buffer.from(screenshot).toString('base64');
      const imgDataUrl = `data:image/jpeg;base64,${imgBase64}`;

      // Build PDF from the screenshot image using jsPDF
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const headerH = 18;
      const footerH = 10;
      const pad = 5;
      const contentH = pageH - headerH - footerH;

      // Get image dimensions from the screenshot buffer
      const imgProps = pdf.getImageProperties(imgDataUrl);
      const scaledW = pageW - pad * 2;
      const scaledH = (imgProps.height / imgProps.width) * scaledW;
      const pages = Math.max(1, Math.ceil(scaledH / contentH));

      for (let p = 0; p < pages; p++) {
        if (p > 0) pdf.addPage();
        pdf.setFillColor(10, 11, 16);
        pdf.rect(0, 0, pageW, pageH, 'F');
        pdf.addImage(imgDataUrl, 'JPEG', pad, headerH - p * contentH, scaledW, scaledH);

        // Cover header/footer bleed
        pdf.setFillColor(10, 11, 16);
        pdf.rect(0, 0, pageW, headerH, 'F');
        pdf.rect(0, pageH - footerH, pageW, footerH, 'F');

        // Header
        if (p === 0) {
          pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(255, 255, 255);
          pdf.text(`DataViz — ${title}`, pad + 3, 11);
          pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(180, 180, 180);
          pdf.text(`Gerado em: ${timestamp}`, pad + 3, 16);
        } else {
          pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(180, 180, 180);
          pdf.text(`${title} — pág. ${p + 1}/${pages}`, pad + 3, 11);
        }
        pdf.setFontSize(8).setTextColor(120, 120, 120);
        pdf.text(
          `DataViz — Relatório gerado automaticamente  |  ${p + 1} / ${pages}`,
          pageW / 2, pageH - 4, { align: 'center' },
        );
      }

      const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

      const filename = `${randomUUID()}.pdf`;
      await writeExportFile(filename, pdfBuffer);

      // Limpa exports que ninguém baixou. Roda aqui, e não num timer, porque
      // timer não sobrevive a container que escala para zero. Best-effort: falha
      // de limpeza não pode derrubar um export que já deu certo.
      void sweepStaleExportFiles().catch(() => {});

      const safeName = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return NextResponse.json({
        url: `/api/download/${filename}`,
        filename: `dataviz-${safeName}-${now.toISOString().slice(0, 10)}.pdf`,
      });
    } finally {
      await browser.close();
      releaseSlot();
    }
  } catch (err) {
    console.error('[export-pdf] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 },
    );
  }
}

function findChrome(): string | null {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  // Windows entrou porque a lista só tinha macOS e Linux: em dev no Windows o
  // export de PDF respondia "Chrome não encontrado" mesmo com o Chrome
  // instalado, e a única saída era descobrir que existia um CHROME_PATH.
  const windows = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const posix = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];

  for (const p of process.platform === 'win32' ? windows : posix) {
    if (!p) continue;
    try { accessSync(p); return p; } catch { continue; }
  }
  return null;
}
