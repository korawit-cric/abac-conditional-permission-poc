import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SessionService } from '../auth/session.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly sessions: SessionService,
    private readonly orders: OrdersService,
  ) {}

  @Get('access-summary')
  async accessSummary(@Headers('cookie') cookie: string | undefined) {
    return this.orders.accessSummary(await this.sessions.authenticate(cookie));
  }

  @Get(':id')
  async findOne(
    @Headers('cookie') cookie: string | undefined,
    @Param('id') id: string,
  ) {
    return this.orders.findOne(await this.sessions.authenticate(cookie), id);
  }

  @Patch(':id')
  async update(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    this.requireTrustedOrigin(origin);
    return this.orders.updateStatus(
      await this.sessions.authenticate(cookie),
      id,
      body.status,
    );
  }

  @Post(':id/refund')
  async refund(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
  ) {
    this.requireTrustedOrigin(origin);
    return this.orders.refund(await this.sessions.authenticate(cookie), id);
  }

  private requireTrustedOrigin(origin: string | undefined) {
    if (origin !== (process.env.WEB_ORIGIN || 'http://localhost:3000')) {
      throw new ForbiddenException('Invalid request origin');
    }
  }
}
