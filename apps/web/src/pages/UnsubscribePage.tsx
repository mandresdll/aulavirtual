import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useUnsubscribe } from '../lib/diffusion';
import { useDocumentTitle } from '../lib/use-document-title';

/** Baja de las novedades: abrir el enlace del correo basta, sin más pasos (RF-02). */
export function UnsubscribePage() {
  useDocumentTitle('Baja de novedades');
  const { token = '' } = useParams();
  const { mutate, isSuccess, isError, error } = useUnsubscribe();

  useEffect(() => {
    mutate(token);
  }, [mutate, token]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-800">Baja de novedades</h1>
      <div className="mt-4">
        {isSuccess && (
          <p role="status">
            Listo. Ya no recibirás novedades de los cursos UTA en ese correo. Si fue un error,
            puedes volver a inscribirte desde la ficha de cualquier curso.
          </p>
        )}
        {isError && <ErrorMessage error={error} />}
        {!isSuccess && !isError && <LoadingMessage />}
      </div>
      <Link to="/cursos" className="mt-4 inline-block font-semibold text-brand-700 underline">
        Ver cursos
      </Link>
    </div>
  );
}
