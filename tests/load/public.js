// Prueba de carga del sitio público con k6 (RNF rendimiento): 300 visitantes simultáneos.
// Uso: k6 run -e BASE_URL=http://localhost:8080 tests/load/public.js
// Ver docs/rendimiento.md. No incluye el pago: depende de la pasarela real (Q1).
/* global __ENV */
import { check, group, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 300);
const COURSES = [
  'programacion-web-con-javascript',
  'ciberseguridad-para-el-trabajo',
  'emprendimiento-digital-en-magallanes',
  'excel-para-la-gestion',
];

export const options = {
  scenarios: {
    visitors: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: VUS },
        { duration: '3m', target: VUS },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:page}': ['p(95)<3000'],
    'http_req_duration{kind:api}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

function get(path, kind) {
  const response = http.get(`${BASE_URL}${path}`, { tags: { kind, name: path.split('?')[0] } });
  check(response, { [`${kind} responde 200`]: (r) => r.status === 200 });
  return response;
}

const think = () => sleep(1 + Math.random() * 3);

export default function visit() {
  const slug = COURSES[Math.floor(Math.random() * COURSES.length)];

  group('portada', () => {
    get('/', 'page');
    get('/api/catalog/courses/featured', 'api');
    get('/api/catalog/areas', 'api');
  });
  think();

  group('catálogo', () => {
    get('/cursos', 'page');
    get('/api/catalog/courses?page=1', 'api');
    get('/api/catalog/courses?q=gestion', 'api');
  });
  think();

  group('ficha', () => {
    get(`/cursos/${slug}`, 'page');
    get(`/api/catalog/courses/${slug}`, 'api');
    http.post(`${BASE_URL}/api/courses/${slug}/views`, '{}', {
      headers: { 'Content-Type': 'application/json' },
      tags: { kind: 'api', name: '/api/courses/views' },
    });
  });
  think();

  group('verificación', () => {
    get('/api/verify/DEM0-CERT-0001', 'api');
  });
  think();
}

export function handleSummary(data) {
  const trend = (name, stat) => {
    const metric = data.metrics[name];
    return metric ? Math.round(metric.values[stat]) : null;
  };
  const summary = {
    vus: VUS,
    requests: data.metrics.http_reqs.values.count,
    requestsPerSecond: Math.round(data.metrics.http_reqs.values.rate),
    failedRate: data.metrics.http_req_failed.values.rate,
    pageP95Ms: trend('http_req_duration{kind:page}', 'p(95)'),
    apiP95Ms: trend('http_req_duration{kind:api}', 'p(95)'),
    apiMaxMs: trend('http_req_duration{kind:api}', 'max'),
  };
  return {
    stdout: `${JSON.stringify(summary)}\n`,
    'load-summary.json': JSON.stringify(summary),
  };
}
