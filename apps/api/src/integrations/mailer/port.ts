export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface Mailer {
  readonly provider: string;
  send(message: MailMessage): Promise<{ messageId: string }>;
}
