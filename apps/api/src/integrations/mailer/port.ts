export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface Mailer {
  readonly provider: string;
  send(message: MailMessage): Promise<{ messageId: string }>;
}
