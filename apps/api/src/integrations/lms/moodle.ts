import { AdapterNotImplementedError } from '../errors.js';
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
}

/**
 * Adaptador Moodle Web Services (REST). Se implementa en la Fase 5 con:
 * `core_user_get_users_by_field`, `core_user_create_users`, `enrol_manual_enrol_users`,
 * `enrol_manual_unenrol_users`, `core_enrol_get_enrolled_users` y
 * `core_completion_get_course_completion_status` / `gradereport_user_get_grade_items`.
 */
export class MoodleLmsGateway implements LmsGateway {
  readonly provider = 'moodle';

  constructor(readonly config: MoodleConfig) {}

  async findUserByEmail(_email: string): Promise<LmsUser | null> {
    throw this.notYet();
  }

  async createUser(_input: CreateLmsUserInput): Promise<LmsUser> {
    throw this.notYet();
  }

  async enrolUser(_input: EnrolInput): Promise<void> {
    throw this.notYet();
  }

  async unenrolUser(_input: { userId: number; courseId: number }): Promise<void> {
    throw this.notYet();
  }

  async isEnrolled(_input: { userId: number; courseId: number }): Promise<boolean> {
    throw this.notYet();
  }

  async getCourseCompletion(_input: {
    userId: number;
    courseId: number;
  }): Promise<CourseCompletion> {
    throw this.notYet();
  }

  private notYet() {
    return new AdapterNotImplementedError('lms', 'Moodle Web Services se implementa en la Fase 5');
  }
}
