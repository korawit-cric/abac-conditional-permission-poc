import { Module } from '@nestjs/common';

import { LinksModule } from './links/links.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';

import { AppService } from './app.service';
import { AppController } from './app.controller';

@Module({
  imports: [PrismaModule, AuthModule, LinksModule, OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
