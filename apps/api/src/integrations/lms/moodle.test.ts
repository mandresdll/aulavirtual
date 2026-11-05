import { describe, expect, it } from 'vitest';
import { lmsContract } from './lms.contract.js';
import { MoodleLmsGateway } from './moodle.js';

/**
 * Moodle falso con las reglas de sus Web Services: siempre 200, errores como JSON y parámetros
 * planos (`users[0][email]`). El adaptador real también debe pasar el contrato contra un Moodle.
 */
const TOKEN = 'service-token';
const URL_BASE = 'https://aula.example.cl/';
const COURSE = 77;

interface FakeUser {
  id: number;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
}

function fakeMoodle() {
  const users: FakeUser[] = [];
  const enrolments = new Set<string>();
  const calls: { fn: string; params: URLSearchParams }[] = [];
  let nextId = 500;

  const impl: typeof fetch = async (input, init) => {
    expect(String(input)).toBe('https://aula.example.cl/webservice/rest/server.php');
    const params = new URLSearchParams(String(init?.body));
    const fn = params.get('wsfunction') ?? '';
    calls.push({ fn, params });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    const fail = (errorcode: string) =>
      json({ exception: 'moodle_exception', errorcode, message: errorcode });
    if (params.get('wstoken') !== TOKEN) return fail('invalidtoken');

    switch (fn) {
      case 'core_user_get_users_by_field':
        return json(users.filter((user) => user.email === params.get('values[0]')));
      case 'core_user_create_users': {
        const email = params.get('users[0][email]') ?? '';
        if (users.some((user) => user.email === email)) return fail('invalidparameter');
        const user = {
          id: nextId++,
          username: params.get('users[0][username]') ?? '',
          email,
          firstname: params.get('users[0][firstname]') ?? '',
          lastname: params.get('users[0][lastname]') ?? '',
        };
        users.push(user);
        return json([{ id: user.id, username: user.username }]);
      }
      case 'enrol_manual_enrol_users':
        enrolments.add(`${params.get('enrolments[0][userid]')}`);
        return json(null);
      case 'enrol_manual_unenrol_users':
        enrolments.delete(`${params.get('enrolments[0][userid]')}`);
        return new Response('', { status: 200 });
      case 'core_enrol_get_enrolled_users':
        return json([...enrolments].map((id) => ({ id: Number(id) })));
      case 'core_completion_get_course_completion_status':
        return fail('nocriteriaset');
      case 'gradereport_user_get_grade_items':
        return json({
          usergrades: [
            { gradeitems: [{ itemtype: 'mod' }, { itemtype: 'course', graderaw: 6.5 }] },
          ],
        });
      default:
        return fail('accessexception');
    }
  };
  return { impl, calls };
}

const gateway = (impl: typeof fetch, token = TOKEN) =>
  new MoodleLmsGateway({ url: URL_BASE, token, studentRoleId: 5, fetch: impl });

lmsContract('moodle (fake Web Services)', () => ({
  lms: gateway(fakeMoodle().impl),
  courseId: COURSE,
}));

describe('MoodleLmsGateway', () => {
  const user = {
    username: 'Ana@Example.com',
    email: 'Ana@Example.com',
    firstName: 'Ana',
    lastName: 'Soto',
  };

  it('creates users in lowercase and lets Moodle send the password', async () => {
    const moodle = fakeMoodle();
    const created = await gateway(moodle.impl).createUser(user);
    expect(created).toMatchObject({ email: 'ana@example.com', username: 'ana@example.com' });
    const call = moodle.calls.find((item) => item.fn === 'core_user_create_users');
    expect(call?.params.get('users[0][createpassword]')).toBe('1');
    expect(call?.params.get('users[0][auth]')).toBe('manual');
  });

  it('sends the student role and the access dates when enrolling', async () => {
    const moodle = fakeMoodle();
    await gateway(moodle.impl).enrolUser({
      userId: 5,
      courseId: COURSE,
      timeStart: new Date('2026-06-01T00:00:00Z'),
      timeEnd: new Date('2026-07-01T00:00:00Z'),
    });
    const { params } = moodle.calls.find((item) => item.fn === 'enrol_manual_enrol_users') ?? {};
    expect(params?.get('enrolments[0][roleid]')).toBe('5');
    expect(params?.get('enrolments[0][courseid]')).toBe('77');
    expect(params?.get('enrolments[0][timestart]')).toBe('1780272000');
  });

  it('reads the grade even when the course has no completion criteria', async () => {
    const lms = gateway(fakeMoodle().impl);
    expect(await lms.getCourseCompletion({ userId: 1, courseId: COURSE })).toEqual({
      completed: false,
      grade: 6.5,
    });
  });

  it('treats a Moodle error as definitive and an outage as retryable', async () => {
    await expect(
      gateway(fakeMoodle().impl, 'otro').findUserByEmail('a@b.cl'),
    ).rejects.toMatchObject({ code: 'invalidtoken', retryable: false });
    const down = gateway(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(down.findUserByEmail('a@b.cl')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      retryable: true,
    });
    const error503 = gateway(async () => new Response('', { status: 503 }));
    await expect(error503.findUserByEmail('a@b.cl')).rejects.toMatchObject({ retryable: true });
  });
});
