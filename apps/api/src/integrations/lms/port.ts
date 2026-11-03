/**
 * Puerto del Aula Virtual (RF-05, RF-06). Supuesto por defecto (Q4): Moodle 4.x con
 * matrícula manual (`enrol_manual`) y aprobación por finalización de curso.
 */
export interface LmsUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateLmsUserInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface EnrolInput {
  userId: number;
  courseId: number;
  timeStart?: Date;
  timeEnd?: Date;
}

export interface CourseCompletion {
  completed: boolean;
  /** Nota final del curso si el LMS la informa; `null` si el curso no tiene nota. */
  grade: number | null;
}

export interface LmsGateway {
  readonly provider: string;
  findUserByEmail(email: string): Promise<LmsUser | null>;
  createUser(input: CreateLmsUserInput): Promise<LmsUser>;
  /** Idempotente: matricular a alguien ya matriculado no es un error. */
  enrolUser(input: EnrolInput): Promise<void>;
  unenrolUser(input: { userId: number; courseId: number }): Promise<void>;
  isEnrolled(input: { userId: number; courseId: number }): Promise<boolean>;
  getCourseCompletion(input: { userId: number; courseId: number }): Promise<CourseCompletion>;
}
