import prisma, { OrderStatus, RoleCode } from '../src/index';

const permissionCodes = [
  'order.read',
  'order.update_status',
  'order.refund',
  'inventory.adjust',
  'promotion.manage',
] as const;

const grants: Record<RoleCode, readonly string[]> = {
  CUSTOMER: ['order.read'],
  STORE_STAFF: ['order.read', 'order.update_status'],
  STORE_MANAGER: [
    'order.read',
    'order.update_status',
    'order.refund',
    'inventory.adjust',
  ],
  HQ_ADMIN: ['promotion.manage'],
};

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const code of permissionCodes) {
      await tx.permission.upsert({
        where: { code },
        update: {},
        create: { code },
      });
    }

    for (const code of Object.values(RoleCode)) {
      const role = await tx.role.upsert({
        where: { code },
        update: {},
        create: { code },
      });
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...grants[code]] } },
      });
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }

    for (const store of [
      { id: '10', tenantId: 'thai-food', region: 'TH' },
      { id: '42', tenantId: 'thai-food', region: 'TH' },
      { id: 'other-10', tenantId: 'other-company', region: 'TH' },
    ])
      await tx.store.upsert({
        where: { id: store.id },
        update: store,
        create: store,
      });

    const users = [
      {
        id: 'mock-customer',
        name: 'Customer',
        role: RoleCode.CUSTOMER,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 0,
        customerId: 'c-1',
        stores: [],
      },
      {
        id: 'mock-staff-10',
        name: 'Store 10 staff',
        role: RoleCode.STORE_STAFF,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 0,
        stores: ['10'],
      },
      {
        id: 'mock-manager-10',
        name: 'Store 10 manager',
        role: RoleCode.STORE_MANAGER,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 500,
        stores: ['10'],
      },
      {
        id: 'mock-manager-42',
        name: 'Store 42 manager',
        role: RoleCode.STORE_MANAGER,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 500,
        stores: ['42'],
      },
      {
        id: 'mock-hq',
        name: 'HQ admin',
        role: RoleCode.HQ_ADMIN,
        tenantId: 'thai-food',
        region: 'TH',
        refundLimit: 0,
        stores: [],
      },
    ];
    for (const user of users) {
      const role = await tx.role.findUniqueOrThrow({
        where: { code: user.role },
      });
      await tx.user.upsert({
        where: { id: user.id },
        update: {
          name: user.name,
          tenantId: user.tenantId,
          region: user.region,
          refundLimit: user.refundLimit,
          customerId: user.customerId,
          roleId: role.id,
        },
        create: {
          id: user.id,
          name: user.name,
          tenantId: user.tenantId,
          region: user.region,
          refundLimit: user.refundLimit,
          customerId: user.customerId,
          roleId: role.id,
        },
      });
      await tx.userStore.deleteMany({ where: { userId: user.id } });
      await tx.userStore.createMany({
        data: user.stores.map((storeId) => ({ userId: user.id, storeId })),
      });
    }

    const orders = [
      {
        id: '900',
        tenantId: 'thai-food',
        storeId: '42',
        region: 'TH',
        customerId: 'c-1',
        status: OrderStatus.PREPARING,
        total: 300,
      },
      {
        id: '901',
        tenantId: 'thai-food',
        storeId: '10',
        region: 'TH',
        customerId: 'c-2',
        status: OrderStatus.PAID,
        total: 300,
      },
      {
        id: '902',
        tenantId: 'thai-food',
        storeId: '10',
        region: 'TH',
        customerId: 'c-2',
        status: OrderStatus.PAID,
        total: 800,
      },
      {
        id: '903',
        tenantId: 'other-company',
        storeId: 'other-10',
        region: 'TH',
        customerId: 'c-1',
        status: OrderStatus.PAID,
        total: 100,
      },
    ];
    for (const order of orders)
      await tx.order.upsert({
        where: { id: order.id },
        update: order,
        create: order,
      });
  });
}

main()
  .then(() => console.info('Authorization seed completed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
