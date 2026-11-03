import { useDocumentTitle } from '../../lib/use-document-title';

/**
 * Panel de administración. Se carga en un chunk aparte (code splitting) para que el sitio
 * público no descargue el código del panel. Protección por roles: Fase 2.
 */
export function AdminHomePage() {
  useDocumentTitle('Administración');

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-bold text-brand-800">Panel de administración</h1>
      <p className="mt-2 text-ink-muted">
        El acceso con cuenta institucional y la gestión de cursos se habilitan en la Fase 2.
      </p>
    </div>
  );
}
