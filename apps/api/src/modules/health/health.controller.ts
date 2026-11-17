import { Controller, Get, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { TOKENS } from '../../common/tokens';
import { RabbitClient } from '../../infra/messaging/rabbit.client';

@Controller()
export class HealthController {
  constructor(
    @Inject(TOKENS.DataSource) private readonly ds: DataSource,
    @Inject(TOKENS.Redis) private readonly redis: Redis,
    @Inject(TOKENS.Rabbit) private readonly rabbit: RabbitClient,
  ) {}

  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  @Get('health')
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.ds.query('SELECT 1');
      checks.postgres = 'up';
    } catch {
      checks.postgres = 'down';
    }
    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }
    try {
      checks.rabbit = this.rabbit.channel ? 'up' : 'down';
    } catch {
      checks.rabbit = 'down';
    }
    const ok = Object.values(checks).every((v) => v === 'up');
    return { status: ok ? 'ok' : 'degraded', checks };
  }
}
