import type { RoleCode } from '@repo/prisma';

export type AuthenticatedActor = {
  id: string;
  name: string;
  tenantId: string;
  region: string;
  refundLimit: number;
  customerId: string | null;
  role: RoleCode;
  permissions: string[];
  storeIds: string[];
};
