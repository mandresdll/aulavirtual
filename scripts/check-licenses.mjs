#!/usr/bin/env node
// Verifica que todas las dependencias de producción usen licencias permitidas (RNF: sin
// licencias de pago recurrentes). Usa `pnpm licenses list`, sin dependencias adicionales.
import { execSync } from 'node:child_process';

const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'PostgreSQL',
  'Python-2.0',
  'Unlicense',
]);

// Paquetes revisados manualmente cuya licencia no se declara en formato SPDX.
const REVIEWED_EXCEPTIONS = new Map([]);

/** Acepta expresiones SPDX simples: "MIT", "(MIT OR Apache-2.0)", "MIT AND ISC". */
function isAllowed(license) {
  const expression = license.replace(/[()]/g, '').trim();
  if (expression.includes(' OR ')) {
    return expression.split(' OR ').some((part) => isAllowed(part));
  }
  if (expression.includes(' AND ')) {
    return expression.split(' AND ').every((part) => isAllowed(part));
  }
  return ALLOWED.has(expression);
}

const output = execSync('pnpm licenses list --json --prod', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(output);

const violations = [];
let total = 0;
for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    total++;
    if (isAllowed(license) || REVIEWED_EXCEPTIONS.has(pkg.name)) continue;
    violations.push(`${pkg.name}@${pkg.versions.join(', ')} — ${license}`);
  }
}

if (violations.length > 0) {
  console.error(`Licencias no permitidas (${violations.length}):`);
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('Revisa la dependencia o agrega una excepción justificada en este script.');
  process.exit(1);
}
console.log(`Licencias OK: ${total} paquetes de producción con licencias permitidas.`);
