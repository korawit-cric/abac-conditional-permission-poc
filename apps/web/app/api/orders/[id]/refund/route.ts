import { NextResponse } from 'next/server';
import { authorize, orders } from '../../../../../lib/auth/authorization';
import { currentActor, sameOrigin } from '../../../../../lib/auth/session';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
  const decision = authorize(actor, 'order.refund', order);
  if (!decision.allowed)
    return NextResponse.json({ error: decision.reason }, { status: 403 });
  return NextResponse.json({
    simulated: true,
    orderId: order.id,
    amount: order.total,
  });
}
