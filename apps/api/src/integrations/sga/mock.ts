import { MOCK_IDENTITIES, type MockIdentity } from '../mock-identities.js';
import type { SgaGateway, SgaUserRoles } from './port.js';

export class MockSgaGateway implements SgaGateway {
  readonly provider = 'mock';

  constructor(private readonly identities: readonly MockIdentity[] = MOCK_IDENTITIES) {}

  async getUserRoles(subject: string): Promise<SgaUserRoles | null> {
    const identity = this.identities.find((item) => item.subject === subject);
    if (!identity) return null;
    return {
      sgaUserId: identity.sgaUserId,
      profiles: [...identity.profiles],
      platformRoles: [...identity.platformRoles],
    };
  }
}
