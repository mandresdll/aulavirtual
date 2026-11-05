import type { ExportFormat } from '@plataforma/shared';
import type { FastifyReply } from 'fastify';
import { strToU8, zipSync } from 'fflate';

export type Cell = string | number | null;

export interface Table {
  /** Nombre del archivo, sin extensión, y de la hoja. */
  name: string;
  headers: string[];
  rows: Cell[][];
}

const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

/** Evita que Excel interprete como fórmula un texto escrito por un comprador. */
function safeText(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = safeText(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con punto y coma y BOM: Excel en español de Chile lo abre sin pasos adicionales. */
export function toCsv(table: Table): Buffer {
  const lines = [table.headers, ...table.rows].map((row) => row.map(csvCell).join(';'));
  return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PACKAGE_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE_RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const SHEET_ML = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

// Caracteres de control que XML 1.0 no admite: harían que Excel rechace el archivo.
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

function xmlText(value: string): string {
  return value
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnName(index: number): string {
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function xlsxCell(value: Cell, column: number, row: number, style: string): string {
  if (value === null) return '';
  const ref = `${columnName(column)}${row}`;
  if (typeof value === 'number') return `<c r="${ref}"${style}><v>${value}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

function sheetXml(table: Table): string {
  const rows = [table.headers, ...table.rows].map((cells, index) => {
    const style = index === 0 ? ' s="1"' : '';
    const body = cells.map((cell, column) => xlsxCell(cell, column, index + 1, style)).join('');
    return `<row r="${index + 1}">${body}</row>`;
  });
  return `${XML_HEADER}<worksheet xmlns="${MAIN_NS}"><sheetData>${rows.join('')}</sheetData></worksheet>`;
}

const STYLES_XML =
  `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/**
 * Libro de Excel de una hoja. Un .xlsx es un zip de archivos XML: se escribe directo para no sumar
 * una librería mayor por una tabla simple. Los textos van como cadenas: Excel no los evalúa.
 */
export function toXlsx(table: Table): Buffer {
  const files: Record<string, string> = {
    '[Content_Types].xml':
      `${XML_HEADER}<Types xmlns="${CONTENT_TYPES_NS}">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      `<Override PartName="/xl/workbook.xml" ContentType="${SHEET_ML}.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${SHEET_ML}.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="${SHEET_ML}.styles+xml"/>` +
      '</Types>',
    '_rels/.rels':
      `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELS}">` +
      `<Relationship Id="rId1" Type="${OFFICE_RELS}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
    'xl/workbook.xml':
      `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${OFFICE_RELS}"><sheets>` +
      `<sheet name="${xmlText(table.name.slice(0, 31))}" sheetId="1" r:id="rId1"/>` +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELS}">` +
      `<Relationship Id="rId1" Type="${OFFICE_RELS}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${OFFICE_RELS}/styles" Target="styles.xml"/>` +
      '</Relationships>',
    'xl/styles.xml': STYLES_XML,
    'xl/worksheets/sheet1.xml': sheetXml(table),
  };
  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)]))),
  );
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: `${SHEET_ML}.sheet`,
};

/** Responde una tabla como archivo descargable. */
export async function sendTable(reply: FastifyReply, table: Table, format: ExportFormat) {
  const content = format === 'csv' ? toCsv(table) : toXlsx(table);
  return reply
    .header('cache-control', 'no-store')
    .header('content-disposition', `attachment; filename="${table.name}.${format}"`)
    .type(CONTENT_TYPES[format])
    .send(content);
}
