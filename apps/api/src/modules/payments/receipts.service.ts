import {
  formatClp,
  formatDateTime,
  SALES_DOCUMENT_LABELS,
  TAX_TREATMENT_LABELS,
  type ProviderInfo,
  type SalesDocumentType,
  type TaxTreatment,
} from '@plataforma/shared';
import type { PrismaClient } from '@prisma/client';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Mailer } from '../../integrations/mailer/port.js';
import { AppError } from '../../lib/errors.js';
import type { PaymentsLogger } from './payments.service.js';

export interface ReceiptData {
  number: string;
  buyerName: string;
  paidAt: Date;
  documentType: SalesDocumentType;
  couponCode: string | null;
  subtotalClp: number;
  discountClp: number;
  totalClp: number;
  lines: { title: string; totalClp: number; taxTreatment: TaxTreatment }[];
  payment: {
    authorizationCode: string | null;
    cardLast4: string | null;
    paymentType: string | null;
  } | null;
}

const BRAND = rgb(0.478, 0.122, 0.239);
const INK = rgb(0.12, 0.1, 0.11);
const MUTED = rgb(0.34, 0.31, 0.35);
const MARGIN = 50;

/** Las fuentes estándar de PDF solo admiten WinAnsi: lo demás se reemplaza. */
const printable = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

/** Comprobante de compra en PDF (RF-03). No reemplaza la boleta o factura (RF-08). */
export async function buildReceiptPdf(
  data: ReceiptData,
  provider: ProviderInfo,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Comprobante ${data.number}`);
  document.setCreator('Plataforma de Cursos UTA');
  const page = document.addPage([595, 842]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  let y = 790;
  const text = (
    value: string,
    options: { x?: number; size?: number; font?: PDFFont; color?: typeof INK } = {},
  ) =>
    drawText(page, printable(value), {
      x: options.x ?? MARGIN,
      y,
      size: options.size ?? 11,
      font: options.font ?? regular,
      color: options.color ?? INK,
    });
  const right = (value: string, font: PDFFont = regular, size = 11) => {
    const safe = printable(value);
    drawText(page, safe, {
      x: 595 - MARGIN - font.widthOfTextAtSize(safe, size),
      y,
      size,
      font,
      color: INK,
    });
  };

  text('Comprobante de compra', { size: 20, font: bold, color: BRAND });
  y -= 22;
  text(provider.name, { size: 10, color: MUTED });
  y -= 14;
  text(`RUT ${provider.rut} · ${provider.address}`, { size: 10, color: MUTED });
  y -= 34;

  text(`Orden: ${data.number}`, { font: bold });
  y -= 16;
  text(`Fecha: ${formatDateTime(data.paidAt)}`);
  y -= 16;
  text(`Comprador: ${data.buyerName}`);
  y -= 16;
  text(`Documento solicitado: ${SALES_DOCUMENT_LABELS[data.documentType]}`);
  y -= 30;

  text('Detalle', { font: bold, color: BRAND });
  y -= 18;
  for (const line of data.lines) {
    text(line.title.slice(0, 70));
    right(formatClp(line.totalClp));
    y -= 13;
    text(TAX_TREATMENT_LABELS[line.taxTreatment], { size: 9, color: MUTED });
    y -= 18;
  }

  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: 595 - MARGIN, y: y + 8 },
    thickness: 0.5,
    color: MUTED,
  });
  y -= 8;
  text('Subtotal');
  right(formatClp(data.subtotalClp));
  y -= 16;
  if (data.discountClp > 0) {
    text(data.couponCode ? `Descuento (${data.couponCode})` : 'Descuento');
    right(`- ${formatClp(data.discountClp)}`);
    y -= 16;
  }
  text('Total pagado', { font: bold, size: 13 });
  right(formatClp(data.totalClp), bold, 13);
  y -= 32;

  if (data.payment) {
    text('Pago', { font: bold, color: BRAND });
    y -= 18;
    if (data.payment.authorizationCode) {
      text(`Código de autorización: ${data.payment.authorizationCode}`);
      y -= 16;
    }
    if (data.payment.cardLast4) {
      text(`Tarjeta terminada en ${data.payment.cardLast4}`);
      y -= 16;
    }
    y -= 14;
  }

  text('Este comprobante no reemplaza la boleta o factura, que se emite por separado.', {
    size: 9,
    color: MUTED,
  });
  return document.save();
}

function drawText(page: PDFPage, value: string, options: Parameters<PDFPage['drawText']>[1]): void {
  page.drawText(value, options);
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

export interface ReceiptsServiceOptions {
  prisma: PrismaClient;
  mailer: Mailer;
  provider: ProviderInfo;
  logger: PaymentsLogger;
  /** URL pública de la SPA, para el enlace a la orden. */
  webUrl: string;
}

const receiptInclude = {
  user: { select: { name: true, email: true } },
  items: { select: { courseTitle: true, totalClp: true, taxTreatment: true } },
  coupon: { select: { code: true } },
  payments: { where: { confirmedAt: { not: null } }, take: 1 },
} as const;

/** Comprobante descargable y correo de confirmación de las órdenes pagadas. */
export class ReceiptsService {
  constructor(private readonly options: ReceiptsServiceOptions) {}

  private async load(where: { number: string } | { id: string }) {
    const order = await this.options.prisma.order.findUnique({ where, include: receiptInclude });
    if (!order) return null;
    const payment = order.payments[0];
    const data: ReceiptData = {
      number: order.number,
      buyerName: order.user.name,
      paidAt: order.paidAt ?? order.createdAt,
      documentType: order.documentType,
      couponCode: order.coupon?.code ?? null,
      subtotalClp: order.subtotalClp,
      discountClp: order.discountClp,
      totalClp: order.totalClp,
      lines: order.items.map((item) => ({
        title: item.courseTitle,
        totalClp: item.totalClp,
        taxTreatment: item.taxTreatment,
      })),
      payment: payment
        ? {
            authorizationCode: payment.authorizationCode,
            cardLast4: payment.cardLast4,
            paymentType: payment.paymentType,
          }
        : null,
    };
    return { order, data };
  }

  /** PDF de una orden pagada del propio usuario. */
  async pdfFor(userId: string, number: string): Promise<Uint8Array> {
    const loaded = await this.load({ number });
    if (!loaded || loaded.order.userId !== userId) throw AppError.notFound('La orden no existe.');
    if (!loaded.order.paidAt) {
      throw AppError.conflict(
        'ORDER_NOT_PAID',
        'El comprobante está disponible al pagar la orden.',
      );
    }
    return buildReceiptPdf(loaded.data, this.options.provider);
  }

  /**
   * Envía los correos pendientes. Es un paso aparte del pago: si el correo falla, el pago sigue
   * válido y el worker reintenta en la siguiente pasada.
   */
  async sendPending(): Promise<number> {
    const { prisma, mailer, provider, logger, webUrl } = this.options;
    const pending = await prisma.order.findMany({
      where: { paidAt: { not: null }, receiptSentAt: null },
      select: { id: true },
      orderBy: { paidAt: 'asc' },
      take: 50,
    });
    let sent = 0;
    for (const { id } of pending) {
      const loaded = await this.load({ id });
      if (!loaded) continue;
      const { order, data } = loaded;
      try {
        const pdf = await buildReceiptPdf(data, provider);
        const courses = data.lines.map((line) => line.title);
        const url = `${webUrl}/ordenes/${order.number}`;
        await mailer.send({
          to: order.user.email,
          subject: `Compra confirmada: orden ${order.number}`,
          text:
            `Hola ${order.user.name}:\n\nConfirmamos tu compra.\n` +
            `Orden: ${order.number}\nTotal: ${formatClp(order.totalClp)}\n` +
            `Cursos: ${courses.join(', ')}\n\n` +
            `Recibirás por correo el acceso al Aula Virtual.\nDetalle: ${url}\n`,
          html:
            `<p>Hola ${escapeHtml(order.user.name)}:</p><p>Confirmamos tu compra.</p>` +
            `<ul><li>Orden: <strong>${escapeHtml(order.number)}</strong></li>` +
            `<li>Total: ${escapeHtml(formatClp(order.totalClp))}</li>` +
            `<li>Cursos: ${escapeHtml(courses.join(', '))}</li></ul>` +
            `<p>Recibirás por correo el acceso al Aula Virtual.</p>` +
            `<p><a href="${escapeHtml(url)}">Ver la orden</a></p>`,
          attachments: [
            {
              filename: `comprobante-${order.number}.pdf`,
              content: Buffer.from(pdf),
              contentType: 'application/pdf',
            },
          ],
        });
        await prisma.order.update({ where: { id }, data: { receiptSentAt: new Date() } });
        sent += 1;
      } catch (error) {
        logger.warn({ err: error, orderId: id }, 'Receipt email failed, it will be retried');
      }
    }
    return sent;
  }
}
