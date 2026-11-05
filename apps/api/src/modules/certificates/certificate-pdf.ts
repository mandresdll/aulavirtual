import { createHash } from 'node:crypto';
import { formatDate, type ProviderInfo } from '@plataforma/shared';
import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';

export interface CertificatePdfData {
  code: string;
  recipientName: string;
  courseTitle: string;
  hours: number;
  startsAt: Date;
  endsAt: Date;
  issuedAt: Date;
  verificationUrl: string;
}

// Tokens provisorios (Q8): se reemplazan con la identidad gráfica oficial.
const BRAND = rgb(0.478, 0.122, 0.239);
const INK = rgb(0.12, 0.1, 0.11);
const MUTED = rgb(0.34, 0.31, 0.35);
const WIDTH = 842;
const HEIGHT = 595;

/** Las fuentes estándar de PDF solo admiten WinAnsi: lo demás se reemplaza. */
const printable = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

/**
 * Certificado de aprobación (RF-06), A4 horizontal. Es determinista: con los mismos datos
 * produce los mismos bytes (metadatos fijados en la fecha de emisión), así el PDF se regenera al
 * descargarlo y sigue calzando con el hash guardado.
 */
export async function buildCertificatePdf(
  data: CertificatePdfData,
  provider: ProviderInfo,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Certificado ${data.code}`);
  document.setCreator('Plataforma de Cursos UTA');
  document.setProducer('Plataforma de Cursos UTA');
  document.setCreationDate(data.issuedAt);
  document.setModificationDate(data.issuedAt);

  const page = document.addPage([WIDTH, HEIGHT]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  const centered = (text: string, y: number, size: number, font: PDFFont, color = INK) => {
    const safe = printable(text);
    let fitted = size;
    while (font.widthOfTextAtSize(safe, fitted) > WIDTH - 120 && fitted > 10) fitted -= 1;
    page.drawText(safe, {
      x: (WIDTH - font.widthOfTextAtSize(safe, fitted)) / 2,
      y,
      size: fitted,
      font,
      color,
    });
  };

  page.drawRectangle({
    x: 24,
    y: 24,
    width: WIDTH - 48,
    height: HEIGHT - 48,
    borderColor: BRAND,
    borderWidth: 2,
  });

  centered(provider.name, 520, 14, bold, BRAND);
  centered('Unidad de Tecnologías para el Aprendizaje', 500, 11, regular, MUTED);
  centered('CERTIFICADO DE APROBACIÓN', 440, 28, bold, BRAND);
  centered('Se certifica que', 400, 13, regular);
  centered(data.recipientName, 360, 26, bold);
  centered('aprobó el curso', 325, 13, regular);
  centered(data.courseTitle, 290, 20, bold);
  centered(
    `Duración: ${data.hours} horas · Del ${formatDate(data.startsAt)} al ${formatDate(data.endsAt)}`,
    258,
    12,
    regular,
    MUTED,
  );
  centered(`Emitido el ${formatDate(data.issuedAt)}`, 238, 12, regular, MUTED);

  const qr = await QRCode.toBuffer(data.verificationUrl, {
    type: 'png',
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
  });
  const image = await document.embedPng(qr);
  page.drawImage(image, { x: 60, y: 60, width: 110, height: 110 });

  page.drawText(printable(`Código de verificación: ${data.code}`), {
    x: 185,
    y: 130,
    size: 13,
    font: bold,
    color: INK,
  });
  page.drawText(printable('Verifica este certificado escaneando el código QR o en:'), {
    x: 185,
    y: 110,
    size: 10,
    font: regular,
    color: MUTED,
  });
  page.drawText(printable(data.verificationUrl), {
    x: 185,
    y: 95,
    size: 10,
    font: regular,
    color: MUTED,
  });

  return document.save({ useObjectStreams: false });
}

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
