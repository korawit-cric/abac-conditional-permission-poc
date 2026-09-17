import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedActor } from './auth.types';

type Session = { sub: string; name: string; expiresAt: number };

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(
    cookieHeader: string | undefined,
  ): Promise<AuthenticatedActor> {
    const token = this.readCookie(cookieHeader, 'app_session');
    const session = this.openSession(token);
    if (!session || session.expiresAt < Date.now())
      throw new UnauthorizedException('Authentication required');

    const user = await this.prisma.client.user.findUnique({
      where: { id: session.sub },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        assignedStores: true,
      },
    });
    if (!user) throw new UnauthorizedException('Application user not found');

    return {
      id: user.id,
      name: user.name,
      tenantId: user.tenantId,
      region: user.region,
      refundLimit: Number(user.refundLimit),
      customerId: user.customerId,
      role: user.role.code,
      permissions: user.role.permissions.map(
        ({ permission }) => permission.code,
      ),
      storeIds: user.assignedStores.map(({ storeId }) => storeId),
    };
  }

  private readCookie(
    header: string | undefined,
    name: string,
  ): string | undefined {
    return header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1);
  }

  private openSession(token: string | undefined): Session | null {
    const secret = process.env.AUTH_COOKIE_SECRET;
    if (!token || !secret || Buffer.from(secret, 'base64url').length < 32)
      return null;
    try {
      const [ivValue, dataValue, tagValue] = token.split('.');
      if (!ivValue || !dataValue || !tagValue) return null;
      const iv = Buffer.from(ivValue, 'base64url');
      const tag = Buffer.from(tagValue, 'base64url');
      if (iv.length !== 12 || tag.length !== 16) return null;
      const key = createHash('sha256')
        .update(secret)
        .update('app-session')
        .digest();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(dataValue, 'base64url')),
          decipher.final(),
        ]).toString(),
      ) as Session;
    } catch {
      return null;
    }
  }
}
