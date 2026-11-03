import { ServiceStatus } from '../components/ServiceStatus';
import { useDocumentTitle } from '../lib/use-document-title';

export function HomePage() {
  useDocumentTitle();

  return (
    <>
      <section className="bg-brand-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <h1 className="text-3xl font-bold text-brand-800 sm:text-4xl">
            Cursos de la Unidad de Tecnologías para el Aprendizaje
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">
            Capacitación del CFT Estatal de Magallanes abierta a la comunidad. Muy pronto podrás
            revisar el catálogo, inscribirte y pagar en línea.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-8" aria-labelledby="estado-servicio">
        <h2 id="estado-servicio" className="mb-2 text-lg font-semibold">
          Estado del servicio
        </h2>
        <ServiceStatus />
      </section>
    </>
  );
}
