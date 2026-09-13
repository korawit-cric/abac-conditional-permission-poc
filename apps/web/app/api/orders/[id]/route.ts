import { NextResponse } from 'next/server';
import {
  authorize,
  authorizeStatusChange,
  orders,
} from '../../../../lib/auth/authorization';
import { currentActor, sameOrigin } from '../../../../lib/auth/session';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await currentActor();
  if (!actor)
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  const order = orders[(await context.params).id];
  if (!order)
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const decision = authorize(actor, 'order.read', order);
  if (!decision.allowed)
    return NextResponse.json({ error: decision.reason }, { status: 403 });
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, context: Context) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const actor = await currentActor();
  if (!actor)
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  const order = orders[(await context.params).id];
  if (!order)
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  if (typeof body?.status !== 'string')
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  const decision = authorizeStatusChange(actor, order, body.status);
  if (!decision.allowed)
    return NextResponse.json({ error: decision.reason }, { status: 403 });
  return NextResponse.json({
    simulated: true,
    orderId: order.id,
    from: order.status,
    to: body.status,
  });
}
