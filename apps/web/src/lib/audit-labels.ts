/** Nombres legibles de las acciones registradas. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'area.create': 'Área creada',
  'area.update': 'Área modificada',
  'area.delete': 'Área eliminada',
  'instructor.create': 'Docente creado',
  'instructor.update': 'Docente modificado',
  'instructor.delete': 'Docente eliminado',
  'course.create': 'Curso creado',
  'course.update': 'Curso modificado',
  'course.publish': 'Curso publicado',
  'course.unpublish': 'Curso despublicado',
  'course.archive': 'Curso archivado',
  'edition.create': 'Edición creada',
  'edition.update': 'Edición modificada',
  'edition.publish': 'Edición publicada',
  'edition.unpublish': 'Edición despublicada',
  'edition.duplicate': 'Edición duplicada',
  'edition.delete': 'Edición eliminada',
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: 'Usuario',
  area: 'Área',
  instructor: 'Docente',
  course: 'Curso',
  course_edition: 'Edición',
};
