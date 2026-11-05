import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { toCsv, toXlsx, type Table } from './tabular.js';

const table: Table = {
  name: 'ventas',
  headers: ['Orden', 'Comprador', 'Total'],
  rows: [
    ['UTA-1', 'Soto; Ana "la jefa"', 1000],
    ['UTA-2', '=HYPERLINK("http://malo")', -500],
    ['UTA-3', null, 0],
  ],
};

describe('toCsv', () => {
  it('uses a BOM and semicolons, and quotes what needs it', () => {
    const text = toCsv(table).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.slice(1).startsWith('Orden;Comprador;Total\r\n')).toBe(true);
    expect(text).toContain('UTA-1;"Soto; Ana ""la jefa""";1000');
    expect(text).toContain('UTA-3;;0');
  });

  it('neutralizes formulas in text but keeps negative numbers', () => {
    const text = toCsv(table).toString('utf8');
    expect(text).toContain(`"'=HYPERLINK(""http://malo"")";-500`);
  });
});

describe('toXlsx', () => {
  const files = (input: Table) => unzipSync(new Uint8Array(toXlsx(input)));
  const sheet = (input: Table) => strFromU8(files(input)['xl/worksheets/sheet1.xml'] as Uint8Array);

  it('packs the parts Excel requires', () => {
    expect(Object.keys(files(table)).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(strFromU8(files(table)['xl/workbook.xml'] as Uint8Array)).toContain('name="ventas"');
  });

  it('writes bold headers, numbers as numbers and text that is never a formula', () => {
    const xml = sheet(table);
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(xml).toContain('<c r="C2"><v>1000</v></c>');
    expect(xml).toContain('<c r="C3"><v>-500</v></c>');
    expect(xml).toContain('=HYPERLINK(&quot;http://malo&quot;)');
    expect(xml).not.toContain('<f>');
  });

  it('escapes XML and drops control characters', () => {
    const xml = sheet({
      name: 'x',
      headers: ['A'],
      rows: [[`<b>&${String.fromCharCode(1)}`]],
    });
    expect(xml).toContain('&lt;b&gt;&amp;</t>');
  });

  it('names columns past Z', () => {
    const headers = Array.from({ length: 28 }, (_, index) => `C${index}`);
    expect(sheet({ name: 'x', headers, rows: [] })).toContain('r="AB1"');
  });
});
