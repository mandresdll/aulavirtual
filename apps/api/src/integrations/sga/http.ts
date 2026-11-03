import { AdapterNotImplementedError } from '../errors.js';
import type { SgaGateway, SgaUserRoles } from './port.js';

export interface SgaHttpConfig {
  baseUrl: string;
  token: string;
}

/**
 * Cliente HTTP de la API del SGA. El contrato real es desconocido (Q7):
 * se implementa en la Fase 2 sobre el contrato que se acuerde con la UTA.
 */
export class HttpSgaGateway implements SgaGateway {
  readonly provider = 'http';

  constructor(readonly config: SgaHttpConfig) {}

  async getUserRoles(_subject: string): Promise<SgaUserRoles | null> {
    throw new AdapterNotImplementedError('sga', 'contrato de la API del SGA pendiente (Q7)');
  }
}
