import nodemailer, { type Transporter } from 'nodemailer';
import { IntegrationError } from '../errors.js';
import type { MailMessage, Mailer } from './port.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** Envío por el SMTP institucional (Mailpit en desarrollo). */
export class SmtpMailer implements Mailer {
  readonly provider = 'smtp';
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && config.password
        ? { auth: { user: config.user, pass: config.password } }
        : {}),
    });
  }

  async send(message: MailMessage): Promise<{ messageId: string }> {
    try {
      const info = await this.transporter.sendMail({ from: this.config.from, ...message });
      return { messageId: info.messageId };
    } catch (error) {
      throw new IntegrationError('mailer', 'SEND_FAILED', 'SMTP send failed', true, {
        cause: error,
      });
    }
  }
}
