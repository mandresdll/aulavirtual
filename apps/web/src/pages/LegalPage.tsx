import {
  formatDate,
  LEGAL_DOCUMENT_LABELS,
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENT_TYPES,
} from '@plataforma/shared';
import { useParams } from 'react-router';
import { Markdown } from '../components/Markdown';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { useLegalDocuments } from '../lib/commerce';
import { useDocumentTitle } from '../lib/use-document-title';
import { NotFoundPage } from './NotFoundPage';

/** Texto legal vigente: términos, privacidad, retracto o devoluciones (RF-11). */
export function LegalPage() {
  const { slug } = useParams();
  const type = LEGAL_DOCUMENT_TYPES.find((item) => LEGAL_DOCUMENT_SLUGS[item] === slug);
  const legal = useLegalDocuments();
  useDocumentTitle(type ? LEGAL_DOCUMENT_LABELS[type] : undefined);

  if (!type) return <NotFoundPage />;
  const document = legal.data?.items.find((item) => item.type === type);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {legal.isPending && <LoadingMessage />}
      {legal.isError && <ErrorMessage error={legal.error} onRetry={() => void legal.refetch()} />}
      {legal.data && !document && (
        <>
          <h1 className="text-2xl font-bold text-brand-800">{LEGAL_DOCUMENT_LABELS[type]}</h1>
          <p className="mt-4 text-ink-muted">Este texto aún no está publicado.</p>
        </>
      )}
      {document && (
        <article>
          <h1 className="text-2xl font-bold text-brand-800">{document.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Versión {document.version}, vigente desde el{' '}
            <time dateTime={document.effectiveFrom}>
              {formatDate(new Date(document.effectiveFrom))}
            </time>
            .
          </p>
          <Markdown source={document.content} className="mt-6" />
        </article>
      )}
    </div>
  );
}
