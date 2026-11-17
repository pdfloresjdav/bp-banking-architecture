import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { CorePort } from '@bp/domain';
import { TOKENS } from '../../common/tokens';
import { AuthGuard, AuthUser } from '../identity/auth.guard';
import { CurrentUser } from '../identity/current-user.decorator';

@Controller('v1/accounts')
@UseGuards(AuthGuard)
export class AccountsController {
  constructor(@Inject(TOKENS.CorePort) private readonly core: CorePort) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const accounts = await this.core.getAccounts(user.userId);
    return { items: accounts };
  }
}
