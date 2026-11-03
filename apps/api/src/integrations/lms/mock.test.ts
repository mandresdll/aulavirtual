import { describe, expect, it } from 'vitest';
import { lmsContract } from './lms.contract.js';
import { MockLmsGateway } from './mock.js';

lmsContract('mock', () => ({ lms: new MockLmsGateway(), courseId: 42 }));

describe('MockLmsGateway', () => {
  it('lets tests simulate course completion', async () => {
    const lms = new MockLmsGateway();
    const user = await lms.createUser({
      username: 'a',
      email: 'a@example.com',
      firstName: 'A',
      lastName: 'B',
    });
    await lms.enrolUser({ userId: user.id, courseId: 7 });
    lms.setCompletion(user.id, 7, { completed: true, grade: 6.5 });
    expect(await lms.getCourseCompletion({ userId: user.id, courseId: 7 })).toEqual({
      completed: true,
      grade: 6.5,
    });
  });
});
