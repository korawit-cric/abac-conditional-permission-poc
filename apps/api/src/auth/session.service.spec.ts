import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { hashToken, open } from './auth.crypto';
import type { SessionCookie } from './auth-flow.types';
import { SessionService } from './session.service';

process.env.AUTH_COOKIE_SECRET = Buffer.alloc(32, 7).toString('base64url');

function setup() {
  const authSession = {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  };
  const user = { findUnique: jest.fn() };
  const prisma = { client: { authSession, user } } as unknown as PrismaService;
  return { authSession, user, service: new SessionService(prisma) };
}

describe('SessionService', () => {
  it('stores only a hash of the random session token', async () => {
    const { authSession, user, service } = setup();
    user.findUnique.mockResolvedValue({
      id: 'mock-manager-10',
      name: 'Store 10 manager',
    });
    authSession.create.mockResolvedValue({ id: 1 });

    const cookie = await service.createSession({
      subject: 'mock-manager-10',
      displayName: 'Store 10 manager',
    });
    const payload = open<SessionCookie>(cookie!, 'app-session')!;

    expect(authSession.create).toHaveBeenCalledWith({
      data: {
        tokenHash: hashToken(payload.token),
        userId: 'mock-manager-10',
        expiresAt: expect.any(Date),
      },
    });
    expect(JSON.stringify(authSession.create.mock.calls)).not.toContain(
      payload.token,
    );
  });

  it('revokes every unrevoked session belonging to the current user', async () => {
    const { authSession, user, service } = setup();
    user.findUnique.mockResolvedValue({
      id: 'mock-manager-10',
      name: 'Store 10 manager',
    });
    authSession.create.mockResolvedValue({ id: 1 });
    const cookie = await service.createSession({
      subject: 'mock-manager-10',
      displayName: 'Store 10 manager',
    });
    const payload = open<SessionCookie>(cookie!, 'app-session')!;
    authSession.findUnique.mockResolvedValue({
      userId: 'mock-manager-10',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    authSession.updateMany.mockResolvedValue({ count: 3 });

    await expect(
      service.revokeAllSessions(`app_session=${cookie}`),
    ).resolves.toBe(3);
    expect(authSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(payload.token) },
    });
    expect(authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'mock-manager-10', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects a revoked database session', async () => {
    const { authSession, user, service } = setup();
    user.findUnique.mockResolvedValue({
      id: 'mock-manager-10',
      name: 'Store 10 manager',
    });
    authSession.create.mockResolvedValue({ id: 1 });
    const cookie = await service.createSession({
      subject: 'mock-manager-10',
      displayName: 'Store 10 manager',
    });
    authSession.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.authenticate(`app_session=${cookie}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
