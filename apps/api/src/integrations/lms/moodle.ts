import { IntegrationError } from '../errors.js';
import type {
  CourseCompletion,
  CreateLmsUserInput,
  EnrolInput,
  LmsGateway,
  LmsUser,
} from './port.js';

export interface MoodleConfig {
  url: string;
  token: string;
  studentRoleId: number;
  timeoutMs?: number;
  /** Inyectable para pruebas. */
  fetch?: typeof fetch;
}

type Params = Record<string, string | number>;

interface MoodleUser {
  id: number;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
}

interface MoodleError {
  exception: string;
  errorcode: string;
  message: string;
}

const isMoodleError = (value: unknown): value is MoodleError =>
  typeof value === 'object' && value !== null && 'exception' in value;

/** Moodle responde esto cuando el curso no tiene criterios de finalización. */
const NO_COMPLETION_CRITERIA = 'nocriteriaset';

/**
 * Adaptador Moodle Web Services (REST, Q4). Moodle responde 200 también en los errores: el
 * error llega como `{ exception, errorcode, message }`. Un fallo de red o un 5xx se reintenta;
 * un error de Moodle (datos rechazados, función sin habilitar) es definitivo.
 */
export class MoodleLmsGateway implements LmsGateway {
  readonly provider = 'moodle';

  constructor(readonly config: MoodleConfig) {}

  async findUserByEmail(email: string): Promise<LmsUser | null> {
    const users = await this.call<MoodleUser[]>('core_user_get_users_by_field', {
      field: 'email',
      'values[0]': email.toLowerCase(),
    });
    const user = users[0];
    return user ? toUser(user) : null;
  }

  async createUser(input: CreateLmsUserInput): Promise<LmsUser> {
    const created = await this.call<{ id: number; username: string }[]>('core_user_create_users', {
      'users[0][username]': input.username.toLowerCase(),
      'users[0][email]': input.email.toLowerCase(),
      'users[0][firstname]': input.firstName,
      'users[0][lastname]': input.lastName,
      'users[0][auth]': 'manual',
      // Moodle genera la contraseña y la envía al correo del usuario.
      'users[0][createpassword]': 1,
    });
    const user = created[0];
    if (!user) throw new IntegrationError('lms', 'INVALID_RESPONSE', 'Moodle created no user');
    return { ...input, email: input.email.toLowerCase(), id: user.id, username: user.username };
  }

  async enrolUser({ userId, courseId, timeStart, timeEnd }: EnrolInput): Promise<void> {
    await this.call('enrol_manual_enrol_users', {
      'enrolments[0][roleid]': this.config.studentRoleId,
      'enrolments[0][userid]': userId,
      'enrolments[0][courseid]': courseId,
      ...(timeStart ? { 'enrolments[0][timestart]': toUnix(timeStart) } : {}),
      ...(timeEnd ? { 'enrolments[0][timeend]': toUnix(timeEnd) } : {}),
    });
  }

  async unenrolUser({ userId, courseId }: { userId: number; courseId: number }): Promise<void> {
    await this.call('enrol_manual_unenrol_users', {
      'enrolments[0][userid]': userId,
      'enrolments[0][courseid]': courseId,
    });
  }

  async isEnrolled({ userId, courseId }: { userId: number; courseId: number }): Promise<boolean> {
    const users = await this.call<{ id: number }[]>('core_enrol_get_enrolled_users', {
      courseid: courseId,
    });
    return users.some((user) => user.id === userId);
  }

  async getCourseCompletion({
    userId,
    courseId,
  }: {
    userId: number;
    courseId: number;
  }): Promise<CourseCompletion> {
    let completed = false;
    try {
      const status = await this.call<{ completionstatus?: { completed?: boolean } }>(
        'core_completion_get_course_completion_status',
        { courseid: courseId, userid: userId },
      );
      completed = status.completionstatus?.completed === true;
    } catch (error) {
      if (!(error instanceof IntegrationError) || error.code !== NO_COMPLETION_CRITERIA) {
        throw error;
      }
    }

    const grades = await this.call<{
      usergrades?: { gradeitems?: { itemtype?: string; graderaw?: number | null }[] }[];
    }>('gradereport_user_get_grade_items', { courseid: courseId, userid: userId });
    const courseItem = grades.usergrades?.[0]?.gradeitems?.find(
      (item) => item.itemtype === 'course',
    );
    return { completed, grade: courseItem?.graderaw ?? null };
  }

  private async call<T>(wsfunction: string, params: Params): Promise<T> {
    const body = new URLSearchParams({
      wstoken: this.config.token,
      wsfunction,
      moodlewsrestformat: 'json',
    });
    for (const [name, value] of Object.entries(params)) body.set(name, String(value));

    const url = `${this.config.url.replace(/\/+$/, '')}/webservice/rest/server.php`;
    const doFetch = this.config.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
      });
    } catch (error) {
      throw new IntegrationError('lms', 'UNAVAILABLE', 'Moodle unreachable', true, {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new IntegrationError(
        'lms',
        `HTTP_${response.status}`,
        `Moodle responded ${response.status}`,
        response.status >= 500,
      );
    }

    // Las funciones sin resultado (`enrol_manual_*`) responden `null` o un cuerpo vacío.
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : null;
    if (isMoodleError(data)) {
      throw new IntegrationError('lms', data.errorcode, `Moodle: ${data.message}`);
    }
    return data as T;
  }
}

const toUnix = (date: Date) => Math.floor(date.getTime() / 1000);

function toUser(user: MoodleUser): LmsUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstname,
    lastName: user.lastname,
  };
}
