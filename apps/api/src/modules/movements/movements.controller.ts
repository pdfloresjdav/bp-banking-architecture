import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../common/tokens';
import { AuthGuard, AuthUser } from '../identity/auth.guard';
import { CurrentUser } from '../identity/current-user.decorator';
import { MovementsService } from './application/movements.service';

@Controller('v1/accounts')
@UseGuards(AuthGuard)
export class MovementsController {
  constructor(@Inject(TOKENS.MovementsService) private readonly service: MovementsService) {}

  @Get(':id/movements')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('id') accountId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const { data, cacheHit } = await this.service.list({
      userId: user.userId,
      accountId,
      cursor: cursor ?? null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
    });
    return { ...data, _cache: cacheHit ? 'HIT' : 'MISS' };
  }
}
