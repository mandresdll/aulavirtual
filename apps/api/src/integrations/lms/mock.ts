import { IntegrationError } from '../errors.js';
import type {
  CourseCompletion,
  CreateLmsUserInput,
  EnrolInput,
  LmsGateway,
  LmsUser,
} from './port.js';

const key = (userId: number, courseId: number) => `${userId}:${courseId}`;

/** Aula Virtual simulada en memoria. */
export class MockLmsGateway implements LmsGateway {
  readonly provider = 'mock';
  private readonly users = new Map<number, LmsUser>();
  private readonly enrolments = new Set<string>();
  private readonly completions = new Map<string, CourseCompletion>();
  private nextId = 100;

  /** Permite a las pruebas simular que el estudiante aprobó (o no) el curso. */
  setCompletion(userId: number, courseId: number, completion: CourseCompletion): void {
    this.completions.set(key(userId, courseId), completion);
  }

  async findUserByEmail(email: string): Promise<LmsUser | null> {
    const normalized = email.toLowerCase();
    return [...this.users.values()].find((user) => user.email === normalized) ?? null;
  }

  async createUser(input: CreateLmsUserInput): Promise<LmsUser> {
    if (await this.findUserByEmail(input.email)) {
      throw new IntegrationError('lms', 'USER_EXISTS', 'A user with that email already exists');
    }
    const user: LmsUser = { ...input, email: input.email.toLowerCase(), id: this.nextId++ };
    this.users.set(user.id, user);
    return user;
  }

  async enrolUser({ userId, courseId }: EnrolInput): Promise<void> {
    if (!this.users.has(userId)) {
      throw new IntegrationError('lms', 'USER_NOT_FOUND', 'Unknown LMS user');
    }
    this.enrolments.add(key(userId, courseId));
  }

  async unenrolUser({ userId, courseId }: { userId: number; courseId: number }): Promise<void> {
    this.enrolments.delete(key(userId, courseId));
  }

  async isEnrolled({ userId, courseId }: { userId: number; courseId: number }): Promise<boolean> {
    return this.enrolments.has(key(userId, courseId));
  }

  async getCourseCompletion({
    userId,
    courseId,
  }: {
    userId: number;
    courseId: number;
  }): Promise<CourseCompletion> {
    if (!this.enrolments.has(key(userId, courseId))) {
      throw new IntegrationError('lms', 'NOT_ENROLLED', 'User is not enrolled in the course');
    }
    return this.completions.get(key(userId, courseId)) ?? { completed: false, grade: null };
  }
}
