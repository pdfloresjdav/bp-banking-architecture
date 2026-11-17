import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import axios from 'axios';
import { CorePort } from '@bp/domain';
import { AppConfig } from '../../config/configuration';
import { TOKENS } from '../../common/tokens';
import { AuthGuard, AuthUser } from '../identity/auth.guard';
import { CurrentUser } from '../identity/current-user.decorator';

/** Customer profile: combines the Core (accounts) + the complementary system (detail). */
@Controller('v1/customers')
@UseGuards(AuthGuard)
export class CustomerController {
  constructor(
    @Inject(TOKENS.CorePort) private readonly core: CorePort,
    @Inject(TOKENS.Config) private readonly cfg: AppConfig,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const accounts = await this.core.getAccounts(user.userId);
    let detail: unknown = null;
    try {
      const res = await axios.get(`${this.cfg.complementary.baseUrl}/complementary/customers/${user.userId}`, {
        timeout: 2000,
        validateStatus: () => true,
      });
      detail = res.status === 200 ? res.data : null;
    } catch {
      detail = null; // graceful degradation: the complementary system is not the source of truth
    }
    return { userId: user.userId, accountsCount: accounts.length, detail };
  }
}
