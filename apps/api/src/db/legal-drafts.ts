import type { LegalDocumentType } from '@plataforma/shared';

/**
 * Textos legales BASE para desarrollo y pruebas (RF-11). Son borradores: el CFT debe revisarlos
 * con su asesoría jurídica y publicar las versiones oficiales desde el panel (`/admin/legales`)
 * antes de vender. El plazo de retracto sigue el supuesto de Q10 (10 días, art. 3 bis de la
 * Ley 19.496).
 */
const DRAFT_NOTICE =
  '> **Borrador de demostración.** Este texto debe ser revisado y publicado por el CFT antes de su uso real.';

export const LEGAL_DRAFTS: Record<LegalDocumentType, { title: string; content: string }> = {
  terms: {
    title: 'Términos y condiciones de compra',
    content: `${DRAFT_NOTICE}

## 1. Proveedor

Los cursos son ofrecidos por el Centro de Formación Técnica Estatal de Magallanes y la Antártica
Chilena, a través de su Unidad de Tecnologías para el Aprendizaje (UTA).

## 2. Compra e inscripción

- Los precios se informan en pesos chilenos e incluyen los impuestos que correspondan.
- El cupo se reserva por un tiempo limitado mientras se completa el pago.
- La inscripción queda confirmada cuando el pago es aprobado por la pasarela de pagos.

## 3. Acceso al curso

Una vez confirmada la inscripción, el acceso al Aula Virtual se informa por correo electrónico.`,
  },
  privacy: {
    title: 'Política de privacidad',
    content: `${DRAFT_NOTICE}

## Datos que tratamos

Nombre, correo electrónico y, si solicitas factura, los datos tributarios de la empresa.

## Finalidad

Gestionar tu compra, inscripción, acceso al Aula Virtual y certificación.

## Tus derechos

Puedes solicitar acceso, rectificación o supresión de tus datos (Leyes 19.628 y 21.719).`,
  },
  withdrawal: {
    title: 'Derecho de retracto',
    content: `${DRAFT_NOTICE}

Puedes retractarte de la compra dentro de los **10 días** siguientes a la contratación, conforme al
artículo 3 bis de la Ley 19.496, siempre que no hayas iniciado el curso.`,
  },
  refunds: {
    title: 'Política de devoluciones',
    content: `${DRAFT_NOTICE}

Las devoluciones se realizan por el mismo medio de pago utilizado. El CFT informará el plazo de
la devolución al aprobarla.`,
  },
};
