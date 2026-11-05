import {
  formatClp,
  REPORT_GROUP_LABELS,
  REPORT_GROUPS,
  ReportQuerySchema,
  toLocalIsoDate,
  type ConversionRow,
  type Report,
  type ReportGroup,
  type ReportQuery,
  type ReportRow,
} from '@plataforma/shared';
import { useSearchParams } from 'react-router';
import { inputClass, secondaryButton } from '../../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../../components/QueryState';
import { toQueryString, useReport } from '../../lib/sales';
import { useDocumentTitle } from '../../lib/use-document-title';

function defaultQuery(): ReportQuery {
  const today = toLocalIsoDate(new Date());
  return { from: `${today.slice(0, 8)}01`, to: today, groupBy: 'course' };
}

/** Reportes del período con gráficos y descarga (RF-09). */
export function ReportsPage() {
  useDocumentTitle('Reportes · Administración');
  const [params, setParams] = useSearchParams();
  const parsed = ReportQuerySchema.safeParse({ ...defaultQuery(), ...Object.fromEntries(params) });
  const query = parsed.success ? parsed.data : defaultQuery();
  const report = useReport(query);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-800">Reportes</h1>
      <p className="mt-1 text-ink-muted">
        Cada venta cuenta en el período en que se pagó, con sus devoluciones a la fecha.
      </p>

      <form
        key={params.toString()}
        role="search"
        aria-label="Filtrar reportes"
        className="mt-4 grid gap-3 rounded-lg border border-gray-200 bg-surface-muted p-4 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setParams({
            from: String(data.get('from')),
            to: String(data.get('to')),
            groupBy: String(data.get('groupBy')),
          });
        }}
      >
        <div>
          <label htmlFor="rep-from" className="block text-sm font-medium">
            Desde
          </label>
          <input
            id="rep-from"
            name="from"
            type="date"
            required
            defaultValue={query.from}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="rep-to" className="block text-sm font-medium">
            Hasta
          </label>
          <input
            id="rep-to"
            name="to"
            type="date"
            required
            defaultValue={query.to}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="rep-group" className="block text-sm font-medium">
            Agrupar por
          </label>
          <select id="rep-group" name="groupBy" defaultValue={query.groupBy} className={inputClass}>
            {REPORT_GROUPS.map((group) => (
              <option key={group} value={group}>
                {REPORT_GROUP_LABELS[group]}
              </option>
            ))}
          </select>
        </div>
        <div className="self-end">
          <button type="submit" className={secondaryButton}>
            Ver reporte
          </button>
        </div>
      </form>
      {!parsed.success && (
        <p role="alert" className="mt-2 text-red-800">
          Revisa las fechas: se muestra el mes en curso.
        </p>
      )}

      <div className="mt-6">
        {report.isPending && <LoadingMessage />}
        {report.isError && <ErrorMessage error={report.error} />}
        {report.data && <ReportView report={report.data} query={query} />}
      </div>
    </div>
  );
}

const exportHref = (query: ReportQuery, table: string, format: string) =>
  `/api/admin/reports/export?${toQueryString({ ...query, table, format })}`;

function Downloads({ query, table, label }: { query: ReportQuery; table: string; label: string }) {
  return (
    <p className="mt-2 flex flex-wrap gap-3 text-sm">
      <a className="underline" href={exportHref(query, table, 'xlsx')}>
        Descargar {label} en Excel
      </a>
      <a className="underline" href={exportHref(query, table, 'csv')}>
        Descargar {label} en CSV
      </a>
    </p>
  );
}

function ReportView({ report, query }: { report: Report; query: ReportQuery }) {
  const { totals } = report;
  const approvalBase = totals.completed + totals.failedCourse;
  return (
    <div className="space-y-8">
      <section aria-labelledby="rep-resumen">
        <h2 id="rep-resumen" className="text-lg font-semibold">
          Resumen
        </h2>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ingresos netos" value={formatClp(totals.netClp)} />
          <Stat label="Ingresos brutos" value={formatClp(totals.grossClp)} />
          <Stat label="Descuentos" value={formatClp(totals.discountClp)} />
          <Stat label="Devoluciones" value={formatClp(totals.refundsClp)} />
          <Stat label="Órdenes pagadas" value={String(totals.orders)} />
          <Stat
            label="Inscritos (pagados / liberados)"
            value={`${totals.paidEnrollments} / ${totals.freeEnrollments}`}
          />
          <Stat
            label="Aprobación"
            value={
              approvalBase === 0
                ? 'Sin resultados'
                : `${Math.round((totals.completed / approvalBase) * 100)} %`
            }
          />
          <Stat label="Certificados emitidos" value={String(totals.certificates)} />
        </dl>
      </section>

      <section aria-labelledby="rep-detalle">
        <h2 id="rep-detalle" className="text-lg font-semibold">
          Ingresos netos por {REPORT_GROUP_LABELS[query.groupBy].toLowerCase()}
        </h2>
        {report.rows.length === 0 ? (
          <p className="mt-2 text-ink-muted">No hay movimientos en este período.</p>
        ) : (
          <>
            <NetChart rows={report.rows} />
            <SummaryTable rows={report.rows} group={query.groupBy} />
            <Downloads query={query} table="summary" label="este detalle" />
          </>
        )}
      </section>

      <section aria-labelledby="rep-conversion">
        <h2 id="rep-conversion" className="text-lg font-semibold">
          Conversión por campaña
        </h2>
        {report.conversion.length === 0 ? (
          <p className="mt-2 text-ink-muted">Sin visitas registradas en este período.</p>
        ) : (
          <>
            <ConversionTable rows={report.conversion} />
            <Downloads query={query} table="conversion" label="la conversión" />
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-xl font-bold">{value}</dd>
    </div>
  );
}

/** Barras horizontales de una sola serie: la tabla de abajo trae los mismos datos. */
function NetChart({ rows }: { rows: ReportRow[] }) {
  const max = Math.max(...rows.map((row) => Math.max(row.netClp, 0)), 1);
  return (
    <ul aria-hidden="true" className="mt-3 space-y-2">
      {rows.slice(0, 12).map((row) => (
        <li
          key={row.key}
          title={`${row.label}: ${formatClp(row.netClp)}`}
          className="grid items-center gap-x-3 text-sm sm:grid-cols-[14rem_1fr_7rem]"
        >
          <span className="truncate text-ink-muted">{row.label}</span>
          <span className="block h-3">
            <span
              className="block h-3 rounded-r bg-brand-700"
              style={{ width: `${Math.max((row.netClp / max) * 100, 0)}%` }}
            />
          </span>
          <span className="font-medium sm:text-right">{formatClp(row.netClp)}</span>
        </li>
      ))}
    </ul>
  );
}

const headerCell = 'py-2 pr-3 font-semibold';

function SummaryTable({ rows, group }: { rows: ReportRow[]; group: ReportGroup }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Detalle por {REPORT_GROUP_LABELS[group]}</caption>
        <thead>
          <tr className="border-b border-gray-300">
            {[
              REPORT_GROUP_LABELS[group],
              'Órdenes',
              'Brutos',
              'Descuentos',
              'Devoluciones',
              'Netos',
              'Pagados',
              'Liberados',
              'Aprobados',
              'Reprobados',
              'Certificados',
            ].map((header) => (
              <th key={header} scope="col" className={headerCell}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-gray-200">
              <th scope="row" className="py-2 pr-3 font-normal">
                {row.label}
              </th>
              <td className="py-2 pr-3">{row.orders}</td>
              <td className="py-2 pr-3">{formatClp(row.grossClp)}</td>
              <td className="py-2 pr-3">{formatClp(row.discountClp)}</td>
              <td className="py-2 pr-3">{formatClp(row.refundsClp)}</td>
              <td className="py-2 pr-3">{formatClp(row.netClp)}</td>
              <td className="py-2 pr-3">{row.paidEnrollments}</td>
              <td className="py-2 pr-3">{row.freeEnrollments}</td>
              <td className="py-2 pr-3">{row.completed}</td>
              <td className="py-2 pr-3">{row.failedCourse}</td>
              <td className="py-2">{row.certificates}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversionTable({ rows }: { rows: ConversionRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Visitas, interesados, órdenes y pagos por campaña</caption>
        <thead>
          <tr className="border-b border-gray-300">
            {['Fuente', 'Medio', 'Campaña', 'Visitas', 'Interesados', 'Órdenes', 'Pagos'].map(
              (header) => (
                <th key={header} scope="col" className={headerCell}>
                  {header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.source}|${row.medium}|${row.campaign}`}
              className="border-b border-gray-200"
            >
              <th scope="row" className="py-2 pr-3 font-normal">
                {row.source || '(directo)'}
              </th>
              <td className="py-2 pr-3">{row.medium || '—'}</td>
              <td className="py-2 pr-3">{row.campaign || '—'}</td>
              <td className="py-2 pr-3">{row.views}</td>
              <td className="py-2 pr-3">{row.leads}</td>
              <td className="py-2 pr-3">{row.orders}</td>
              <td className="py-2">{row.paid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
