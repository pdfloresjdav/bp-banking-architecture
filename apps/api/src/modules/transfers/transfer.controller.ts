import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Inject, NotFoundException, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IDEMPOTENCY_HEADER } from '@bp/shared';
import { TransferResponse } from '@bp/contracts';
import { TOKENS } from '../../common/tokens';
import { AuthGuard, AuthUser } from '../identity/auth.guard';
import { CorrelationId, CurrentUser } from '../identity/current-user.decorator';
import { CreateTransferDto } from './transfer.dto';
import { TransferService } from './application/transfer.service';

@Controller('v1/transfers')
@UseGuards(AuthGuard)
export class TransferController {
  constructor(@Inject(TOKENS.TransferService) private readonly service: TransferService) {}

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthUser,
    @CorrelationId() correlationId: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string | undefined,
    @Body() dto: CreateTransferDto,
  ): Promise<TransferResponse> {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key is required');
    // Step-up is mandatory for a sensitive operation.
    if (!user.stepup) throw new UnauthorizedException('step_up_required');

    return this.service.create({
      userId: user.userId,
      correlationId,
      idempotencyKey,
      request: {
        sourceAccountId: dto.sourceAccountId,
        destinationAccountId: dto.destinationAccountId,
        amount: dto.amount,
        kind: dto.kind,
        description: dto.description,
      },
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<TransferResponse> {
    const found = await this.service.getById(id);
    if (!found) throw new NotFoundException('Transfer not found');
    return found;
  }
}
