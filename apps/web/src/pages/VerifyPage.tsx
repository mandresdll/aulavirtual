import { formatDate, type Verification } from '@plataforma/shared';
import { Link, useNavigate, useParams } from 'react-router';
import { inputClass, primaryButton } from '../components/admin/ui';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useVerification } from '../lib/certificates';
import { useDocumentTitle } from '../lib/use-document-title';

/** Verificación pública de un certificado por código o QR (RF-06). */
export function VerifyPage() {
  useDocumentTitle('Verificar certificado');
  const { codigo } = useParams();
  const navigate = useNavigate();
  const verification = useVerification(codigo);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-brand-800">Verificar certificado</h1>
      <p className="mt-2 text-ink-muted">
        Escribe el código impreso en el certificado o escanea su código QR.
      </p>
      <form
        role="search"
        aria-label="Verificar un certificado"
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get('codigo') ?? '').trim();
          if (value) void navigate(`/verificar/${encodeURIComponent(value)}`);
        }}
      >
        <div className="min-w-60 flex-1">
          <label htmlFor="certificado-codigo" className="block text-sm font-medium">
            Código del certificado
          </label>
          <input
            key={codigo}
            id="certificado-codigo"
            name="codigo"
            defaultValue={codigo ?? ''}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <button type="submit" className={primaryButton}>
          Verificar
        </button>
      </form>

      <div className="mt-6">
        {codigo && verification.isPending && <LoadingMessage />}
        {verification.isError && (
          <ErrorMessage error={verification.error} onRetry={() => void verification.refetch()} />
        )}
        {verification.data && <Result verification={verification.data} />}
      </div>
    </div>
  );
}

const panel = 'rounded-md border p-4';

function Result({ verification }: { verification: Verification }) {
  switch (verification.status) {
    case 'valid':
      return (
        <div role="status" className={`${panel} border-green-200 bg-green-50 text-green-900`}>
          <p className="text-lg font-bold">Certificado válido</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-medium">Titular:</dt>
            <dd>{verification.holderName}</dd>
            <dt className="font-medium">Curso:</dt>
            <dd>{verification.courseTitle}</dd>
            <dt className="font-medium">Horas:</dt>
            <dd>{verification.hours}</dd>
            <dt className="font-medium">Emitido el:</dt>
            <dd>{formatDate(new Date(verification.issuedAt))}</dd>
            <dt className="font-medium">Código:</dt>
            <dd>{verification.code}</dd>
          </dl>
        </div>
      );
    case 'revoked':
      return (
        <div role="status" className={`${panel} border-red-200 bg-red-50 text-red-800`}>
          <p className="text-lg font-bold">Certificado revocado</p>
          <p className="mt-1">
            El certificado {verification.code} fue revocado el{' '}
            {formatDate(new Date(verification.revokedAt))} y ya no tiene validez.
          </p>
        </div>
      );
    case 'reissued':
      return (
        <div role="status" className={`${panel} border-amber-200 bg-amber-50 text-amber-900`}>
          <p className="text-lg font-bold">Certificado reemplazado</p>
          <p className="mt-1">El certificado {verification.code} fue reemplazado por otro.</p>
          {verification.replacedBy && (
            <p className="mt-1">
              Código vigente:{' '}
              <Link
                to={`/verificar/${verification.replacedBy}`}
                className="font-semibold underline"
              >
                {verification.replacedBy}
              </Link>
            </p>
          )}
        </div>
      );
    case 'not_found':
      return (
        <div role="status" className={`${panel} border-red-200 bg-red-50 text-red-800`}>
          <p className="text-lg font-bold">Certificado no encontrado</p>
          <p className="mt-1">Revisa que el código esté bien escrito.</p>
        </div>
      );
  }
}
