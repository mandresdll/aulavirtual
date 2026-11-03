import { ReturnToSchema } from '@plataforma/shared';
import { Navigate, useSearchParams } from 'react-router';
import { LoadingMessage } from '../components/QueryState';
import { loginUrl, useSession } from '../lib/session';
import { useDocumentTitle } from '../lib/use-document-title';

/** Motivos que informa la API al volver del proveedor de identidad (`/ingresar?error=`). */
const LOGIN_ERRORS: Record<string, string> = {
  cancelado: 'Cancelaste el inicio de sesión. Puedes intentarlo nuevamente cuando quieras.',
  expirado: 'El intento de inicio de sesión expiró. Vuelve a ingresar.',
  rechazado: 'No pudimos validar tu identidad con la cuenta institucional. Intenta nuevamente.',
  'no-disponible':
    'El servicio de identidad institucional no está disponible en este momento. Intenta nuevamente en unos minutos.',
  cuenta: 'Tu correo ya está asociado a otra cuenta. Contacta a la UTA para revisarlo.',
};

/** Inicio de sesión con la cuenta institucional del CFT (SSO, RF-10). */
export function LoginPage() {
  useDocumentTitle('Ingresar');
  const [params] = useSearchParams();
  const session = useSession();
  const parsedReturnTo = ReturnToSchema.safeParse(params.get('returnTo'));
  const returnTo = parsedReturnTo.success ? parsedReturnTo.data : '/';
  const error = params.get('error');
  const errorMessage = error ? (LOGIN_ERRORS[error] ?? LOGIN_ERRORS.rechazado) : null;

  if (session.isPending) return <LoadingMessage />;
  if (session.data?.authenticated && !errorMessage) return <Navigate to={returnTo} replace />;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold text-brand-800">Ingresar</h1>
      {errorMessage && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {errorMessage}
        </p>
      )}
      <p className="mt-4 text-ink-muted">
        Ingresa con tu cuenta institucional del CFT Estatal de Magallanes. Serás dirigido al
        servicio de identidad y volverás a esta página.
      </p>
      <a
        href={loginUrl(returnTo)}
        className="mt-6 inline-block rounded-md bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-800"
      >
        Ingresar con cuenta institucional
      </a>
    </div>
  );
}
