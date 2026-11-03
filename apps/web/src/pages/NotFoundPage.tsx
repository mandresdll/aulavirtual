import { Link } from 'react-router';
import { useDocumentTitle } from '../lib/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-2xl font-bold text-brand-800">Página no encontrada</h1>
      <p className="mt-2 text-ink-muted">La dirección que buscas no existe o fue movida.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-brand-700 underline">
        Volver al inicio
      </Link>
    </div>
  );
}
