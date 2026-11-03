import type { MailMessage, Mailer } from './port.js';

/** Guarda los correos en memoria para que las pruebas puedan revisarlos. */
export class MemoryMailer implements Mailer {
  readonly provider = 'memory';
  readonly sent: (MailMessage & { messageId: string })[] = [];

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const messageId = `<memory-${this.sent.length + 1}@localhost>`;
    this.sent.push({ ...message, messageId });
    return { messageId };
  }
}
