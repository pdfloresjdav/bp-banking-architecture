import { Controller, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../common/tokens';
import { ReconciliationService } from '../transfers/application/reconciliation.service';
import { InternalTokenGuard } from './internal-token.guard';

/**
 * Protected operational endpoint to trigger reconciliation of UNKNOWN transfers.
 * Intended to be driven by a scheduler/cron or an operator with the internal token.
 */
@Controller('internal/reconcile')
@UseGuards(InternalTokenGuard)
export class ReconciliationController {
  constructor(@Inject(TOKENS.ReconciliationService) private readonly service: ReconciliationService) {}

  @Post()
  @HttpCode(200)
  async run(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 50;
    const result = await this.service.run(Number.isFinite(n) ? n : 50);
    return result;
  }
}
