export type Permission =
  | 'order.read'
  | 'order.update_status'
  | 'order.refund'
  | 'inventory.adjust'
  | 'promotion.manage';

export type Role = 'CUSTOMER' | 'STORE_STAFF' | 'STORE_MANAGER' | 'HQ_ADMIN';
export type Actor = {
  sub: string;
  name: string;
  role: Role;
  tenantId: string;
  storeIds: string[];
  region: string;
  refundLimit: number;
  customerId?: string;
};
export type Order = {
  id: string;
  tenantId: string;
  storeId: string;
  region: string;
  customerId: string;
  status: 'PAID' | 'PREPARING' | 'READY' | 'REFUNDED';
  total: number;
};
export type Decision = { allowed: boolean; reason: string };

const rolePermissions: Record<Role, readonly Permission[]> = {
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

// Mock subjects are mapped to application authorization data on the server.
export const actors: Record<string, Actor> = {
  'mock-customer': {
    sub: 'mock-customer',
    name: 'Customer',
    role: 'CUSTOMER',
    tenantId: 'thai-food',
    storeIds: [],
    region: 'TH',
    refundLimit: 0,
    customerId: 'c-1',
  },
  'mock-staff-10': {
    sub: 'mock-staff-10',
    name: 'Store 10 staff',
    role: 'STORE_STAFF',
    tenantId: 'thai-food',
    storeIds: ['10'],
    region: 'TH',
    refundLimit: 0,
  },
  'mock-manager-10': {
    sub: 'mock-manager-10',
    name: 'Store 10 manager',
    role: 'STORE_MANAGER',
    tenantId: 'thai-food',
    storeIds: ['10'],
    region: 'TH',
    refundLimit: 500,
  },
  'mock-manager-42': {
    sub: 'mock-manager-42',
    name: 'Store 42 manager',
    role: 'STORE_MANAGER',
    tenantId: 'thai-food',
    storeIds: ['42'],
    region: 'TH',
    refundLimit: 500,
  },
  'mock-hq': {
    sub: 'mock-hq',
    name: 'HQ admin',
    role: 'HQ_ADMIN',
    tenantId: 'thai-food',
    storeIds: [],
    region: 'TH',
    refundLimit: 0,
  },
};

export const orders: Record<string, Order> = {
  '900': {
    id: '900',
    tenantId: 'thai-food',
    storeId: '42',
    region: 'TH',
    customerId: 'c-1',
    status: 'PREPARING',
    total: 300,
  },
  '901': {
    id: '901',
    tenantId: 'thai-food',
    storeId: '10',
    region: 'TH',
    customerId: 'c-2',
    status: 'PAID',
    total: 300,
  },
  '902': {
    id: '902',
    tenantId: 'thai-food',
    storeId: '10',
    region: 'TH',
    customerId: 'c-2',
    status: 'PAID',
    total: 800,
  },
  '903': {
    id: '903',
    tenantId: 'other-company',
    storeId: '10',
    region: 'TH',
    customerId: 'c-1',
    status: 'PAID',
    total: 100,
  },
};

const deny = (reason: string): Decision => ({ allowed: false, reason });
const allow: Decision = {
  allowed: true,
  reason: 'Allowed by role and resource conditions',
};

export function authorize(
  actor: Actor,
  permission: Permission,
  order: Order,
): Decision {
  if (!rolePermissions[actor.role].includes(permission))
    return deny('Role lacks permission');
  if (actor.tenantId !== order.tenantId) return deny('Tenant boundary');
  if (permission === 'order.read' && actor.role === 'CUSTOMER') {
    return actor.customerId === order.customerId
      ? allow
      : deny('Order belongs to another customer');
  }
  if (!actor.storeIds.includes(order.storeId))
    return deny('Store is not assigned');
  if (actor.region !== order.region) return deny('Region differs');
  if (permission === 'order.refund') {
    if (order.status !== 'PAID')
      return deny('Only paid orders can be refunded');
    if (order.total > actor.refundLimit) return deny('Refund exceeds limit');
  }
  return allow;
}

export function authorizeStatusChange(
  actor: Actor,
  order: Order,
  next: string,
): Decision {
  const decision = authorize(actor, 'order.update_status', order);
  if (!decision.allowed) return decision;
  const transitions: Record<Order['status'], string[]> = {
    PAID: ['PREPARING'],
    PREPARING: ['READY'],
    READY: [],
    REFUNDED: [],
  };
  return transitions[order.status].includes(next)
    ? allow
    : deny('Invalid order status transition');
}
