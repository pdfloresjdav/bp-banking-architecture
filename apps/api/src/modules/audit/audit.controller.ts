import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { TOKENS } from '../../common/tokens';
import { TypeOrmAuditAdapter } from '../../infra/database/typeorm-audit.adapter';
import { AuthGuard } from '../identity/auth.guard';

/** Activity-history query (operator). */
@Controller('v1/audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(@Inject(TOKENS.AuditPort) private readonly audit: TypeOrmAuditAdapter) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 50;
    const items = await this.audit.query(Number.isFinite(n) ? n : 50);
    return { items };
  }
}
