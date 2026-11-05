import {
  MODALITY_LABELS,
  TAX_TREATMENT_LABELS,
  formatDate,
  formatDateTime,
  type CourseDetail,
  type Edition,
} from '@plataforma/shared';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EditionActions } from '../components/EditionActions';
import { LeadForm } from '../components/LeadForm';
import { Markdown } from '../components/Markdown';
import { SeatsBadge } from '../components/EditionStatus';
import { ErrorMessage, LoadingMessage } from '../components/QueryState';
import { ApiError } from '../lib/api';
import { priceLabel, useCourse } from '../lib/catalog';
import { useRecordCourseView } from '../lib/diffusion';
import { useDocumentTitle } from '../lib/use-document-title';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 text-xl font-bold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EditionCard({ edition }: { edition: Edition }) {
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-ink">
          Inicio: <time dateTime={edition.startsAt}>{formatDate(new Date(edition.startsAt))}</time>
        </h3>
        <SeatsBadge edition={edition} />
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Término</dt>
          <dd>
            <time dateTime={edition.endsAt}>{formatDate(new Date(edition.endsAt))}</time>
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Inscripciones hasta</dt>
          <dd>
            <time dateTime={edition.enrollmentClosesAt}>
              {formatDateTime(new Date(edition.enrollmentClosesAt))}
            </time>
          </dd>
        </div>
        {edition.schedule && (
          <div>
            <dt className="text-ink-muted">Horario</dt>
            <dd>{edition.schedule}</dd>
          </div>
        )}
        {edition.location && (
          <div>
            <dt className="text-ink-muted">Lugar</dt>
            <dd>{edition.location}</dd>
          </div>
        )}
        <div>
          <dt className="text-ink-muted">Cupos</dt>
          <dd>
            {edition.availableSeats} de {edition.capacity} disponibles
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Código</dt>
          <dd>{edition.code}</dd>
        </div>
      </dl>
      <p className="mt-3 text-lg font-bold text-ink">
        {priceLabel(edition)}{' '}
        {edition.priceClp > 0 && (
          <span className="text-sm font-normal text-ink-muted">
            (precio total, {TAX_TREATMENT_LABELS[edition.taxTreatment]})
          </span>
        )}
      </p>
      {edition.freeForCommunity && (
        <p className="mt-1 text-sm text-green-800">
          Liberado para estudiantes, docentes y funcionarios del CFT.
        </p>
      )}
      <EditionActions edition={edition} />
    </li>
  );
}

function CourseView({ course }: { course: CourseDetail }) {
  useRecordCourseView(course.slug);
  return (
    <article>
      <div className="bg-brand-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[3fr_2fr] lg:items-center">
          <div>
            <nav aria-label="Ruta de navegación" className="text-sm">
              <ol className="flex flex-wrap gap-1 text-ink-muted">
                <li>
                  <Link to="/" className="underline hover:text-brand-700">
                    Inicio
                  </Link>{' '}
                  /
                </li>
                <li>
                  <Link to="/cursos" className="underline hover:text-brand-700">
                    Cursos
                  </Link>{' '}
                  /
                </li>
                <li aria-current="page" className="text-ink">
                  {course.title}
                </li>
              </ol>
            </nav>
            <p className="mt-4 text-sm font-medium text-brand-700">{course.area.name}</p>
            <h1 className="mt-1 text-3xl font-bold text-brand-800 sm:text-4xl">{course.title}</h1>
            <p className="mt-3 text-lg text-ink-muted">{course.summary}</p>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="text-sm text-ink-muted">Modalidad</dt>
                <dd className="font-semibold">{MODALITY_LABELS[course.modality]}</dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">Duración</dt>
                <dd className="font-semibold">{course.durationHours} horas</dd>
              </div>
              {course.nextEdition && (
                <div>
                  <dt className="text-sm text-ink-muted">Desde</dt>
                  <dd className="font-semibold">{priceLabel(course.nextEdition)}</dd>
                </div>
              )}
            </dl>
          </div>
          {course.imageUrl && (
            <img
              src={course.imageUrl}
              alt={course.imageAlt ?? ''}
              width={640}
              height={360}
              className="aspect-video w-full rounded-lg bg-white object-cover"
            />
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-12 lg:grid-cols-[3fr_2fr]">
        <div>
          <Section id="descripcion" title="Descripción">
            <Markdown source={course.description} />
          </Section>
          {course.objectives.length > 0 && (
            <Section id="objetivos" title="Objetivos">
              <ul className="list-disc space-y-1 pl-6">
                {course.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </Section>
          )}
          {course.contents.length > 0 && (
            <Section id="contenidos" title="Contenidos">
              <ol className="list-decimal space-y-1 pl-6">
                {course.contents.map((content) => (
                  <li key={content}>{content}</li>
                ))}
              </ol>
            </Section>
          )}
          {course.requirements && (
            <Section id="requisitos" title="Requisitos">
              <p>{course.requirements}</p>
            </Section>
          )}
          {course.certificationInfo && (
            <Section id="certificacion" title="Certificación">
              <p>{course.certificationInfo}</p>
            </Section>
          )}
          {course.instructors.length > 0 && (
            <Section id="docentes" title={course.instructors.length === 1 ? 'Docente' : 'Docentes'}>
              <ul className="space-y-3">
                {course.instructors.map((instructor) => (
                  <li key={instructor.name}>
                    <p className="font-semibold">{instructor.name}</p>
                    {instructor.title && (
                      <p className="text-sm text-ink-muted">{instructor.title}</p>
                    )}
                    {instructor.bio && <p className="mt-1 text-sm">{instructor.bio}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div>
          <Section id="ediciones" title="Fechas y precios">
            {course.editions.length === 0 ? (
              <p className="text-ink-muted">Este curso no tiene ediciones programadas por ahora.</p>
            ) : (
              <ul className="space-y-4">
                {course.editions.map((edition) => (
                  <EditionCard key={edition.id} edition={edition} />
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-ink-muted">
              La inscripción y el pago en línea estarán disponibles próximamente.
            </p>
          </Section>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-12">
        <LeadForm courseSlug={course.slug} />
      </div>
    </article>
  );
}

/** Ficha pública de un curso (RF-01). Los metadatos SEO los inserta el servidor (RF-02). */
export function CoursePage() {
  const { slug = '' } = useParams();
  const course = useCourse(slug);
  const notFound = course.error instanceof ApiError && course.error.status === 404;
  useDocumentTitle(
    course.data?.title ??
      (notFound ? 'Curso no encontrado' : course.isPending ? undefined : 'Curso'),
  );

  if (course.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <LoadingMessage>Cargando el curso…</LoadingMessage>
      </div>
    );
  }

  if (course.isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        {notFound ? (
          <>
            <h1 className="text-2xl font-bold text-brand-800">Curso no encontrado</h1>
            <p className="mt-2 text-ink-muted">
              El curso que buscas no existe o ya no está disponible.
            </p>
            <Link to="/cursos" className="mt-6 inline-block font-medium text-brand-700 underline">
              Ver el catálogo de cursos
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-4 text-2xl font-bold text-brand-800">No pudimos cargar el curso</h1>
            <ErrorMessage error={course.error} onRetry={() => void course.refetch()} />
          </>
        )}
      </div>
    );
  }

  return <CourseView course={course.data} />;
}
