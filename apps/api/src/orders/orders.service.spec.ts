import { ForbiddenException } from '@nestjs/common';
import { OrderStatus, RoleCode } from '@repo/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from '../auth/auth.types';
import { OrdersService } from './orders.service';

const actor: AuthenticatedActor = {
  id: 'mock-manager-10',
  name: 'Store 10 manager',
  tenantId: 'thai-food',
  region: 'TH',
  refundLimit: 500,
  customerId: null,
  role: RoleCode.STORE_MANAGER,
  permissions: ['order.read', 'order.update_status', 'order.refund'],
  storeIds: ['10'],
};

function setup() {
  const order = {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const prisma = { client: { order } } as unknown as PrismaService;
  return { order, service: new OrdersService(prisma) };
}

describe('OrdersService', () => {
  it('places tenant, region and assigned stores in the read query', async () => {
    const { order, service } = setup();
    order.findFirst.mockResolvedValue({ id: '901', total: 300 });

    await service.findOne(actor, '901');

    expect(order.findFirst).toHaveBeenCalledWith({
      where: {
        id: '901',
        tenantId: 'thai-food',
        region: 'TH',
        storeId: { in: ['10'] },
      },
    });
  });

  it('puts every refund condition in one update query', async () => {
    const { order, service } = setup();
    order.updateMany.mockResolvedValue({ count: 1 });

    await service.refund(actor, '901');

    expect(order.updateMany).toHaveBeenCalledWith({
      where: {
        id: '901',
        tenantId: 'thai-food',
        region: 'TH',
        storeId: { in: ['10'] },
        status: OrderStatus.PAID,
        total: { lte: 500 },
      },
      data: { status: OrderStatus.REFUNDED },
    });
  });

  it('denies before querying when the role lacks the named permission', async () => {
    const { order, service } = setup();
    await expect(
      service.refund({ ...actor, permissions: [] }, '901'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(order.updateMany).not.toHaveBeenCalled();
  });
});
