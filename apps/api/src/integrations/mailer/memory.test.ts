import { describe, expect, it } from 'vitest';
import { MemoryMailer } from './memory.js';

describe('MemoryMailer', () => {
  it('records sent messages with unique ids', async () => {
    const mailer = new MemoryMailer();
    const message = { to: 'a@example.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' };
    const first = await mailer.send(message);
    const second = await mailer.send(message);
    expect(first.messageId).not.toBe(second.messageId);
    expect(mailer.sent).toHaveLength(2);
  });
});
