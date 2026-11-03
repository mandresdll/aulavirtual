/**
 * Puerto del validador de certificados del SGA (RF-06). Supuesto por defecto (Q5):
 * la plataforma expone su propia verificación pública y además publica cada certificado
 * en el validador del SGA a través de este puerto.
 */
export interface CertificateRegistration {
  /** Código único verificable del certificado. */
  code: string;
  holderName: string;
  courseTitle: string;
  hours: number;
  issuedAt: Date;
  verificationUrl: string;
}

export interface CertificateValidator {
  readonly provider: string;
  register(certificate: CertificateRegistration): Promise<{ externalId: string }>;
  revoke(input: { code: string; reason: string }): Promise<void>;
}
