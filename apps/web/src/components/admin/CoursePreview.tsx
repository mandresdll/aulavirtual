import { Markdown } from '../Markdown';

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

interface CoursePreviewProps {
  title: string;
  summary: string;
  description: string;
  objectivesText: string;
  contentsText: string;
  requirements: string;
}

/** Vista previa de la ficha con lo escrito en el formulario, aunque aún no esté guardado. */
export function CoursePreview(course: CoursePreviewProps) {
  const objectives = lines(course.objectivesText);
  const contents = lines(course.contentsText);
  return (
    <details className="sm:col-span-2 rounded-lg border border-gray-200 p-4">
      <summary className="cursor-pointer font-semibold">Vista previa de la ficha</summary>
      <div className="mt-3 space-y-3">
        <p className="text-2xl font-bold text-brand-800">{course.title || 'Título del curso'}</p>
        <p className="text-ink-muted">{course.summary}</p>
        <Markdown source={course.description} />
        {objectives.length > 0 && (
          <>
            <p className="font-bold">Objetivos</p>
            <ul className="list-disc pl-6">
              {objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </>
        )}
        {contents.length > 0 && (
          <>
            <p className="font-bold">Contenidos</p>
            <ol className="list-decimal pl-6">
              {contents.map((content) => (
                <li key={content}>{content}</li>
              ))}
            </ol>
          </>
        )}
        {course.requirements && (
          <>
            <p className="font-bold">Requisitos</p>
            <p>{course.requirements}</p>
          </>
        )}
      </div>
    </details>
  );
}
