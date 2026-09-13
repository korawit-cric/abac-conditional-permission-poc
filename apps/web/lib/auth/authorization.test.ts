import {
  actors,
  authorize,
  authorizeStatusChange,
  orders,
} from './authorization';

describe('conditional authorization', () => {
  it('requires a role permission before resource checks', () => {
    expect(
      authorize(actors['mock-hq']!, 'order.refund', orders['901']!).reason,
    ).toBe('Role lacks permission');
    expect(
      authorize(actors['mock-staff-10']!, 'order.refund', orders['901']!)
        .allowed,
    ).toBe(false);
  });

  it('enforces tenant, assigned store, and customer ownership', () => {
    expect(
      authorize(actors['mock-manager-10']!, 'order.read', orders['903']!)
        .reason,
    ).toBe('Tenant boundary');
    expect(
      authorize(actors['mock-manager-10']!, 'order.read', orders['900']!)
        .reason,
    ).toBe('Store is not assigned');
    expect(
      authorize(actors['mock-customer']!, 'order.read', orders['900']!).allowed,
    ).toBe(true);
    expect(
      authorize(actors['mock-customer']!, 'order.read', orders['901']!).allowed,
    ).toBe(false);
  });

  it('checks refund conditions and valid status transitions', () => {
    const manager = actors['mock-manager-10']!;
    expect(authorize(manager, 'order.refund', orders['901']!).allowed).toBe(
      true,
    );
    expect(authorize(manager, 'order.refund', orders['902']!).reason).toBe(
      'Refund exceeds limit',
    );
    expect(
      authorize(actors['mock-manager-42']!, 'order.refund', orders['900']!)
        .reason,
    ).toBe('Only paid orders can be refunded');
    expect(
      authorizeStatusChange(actors['mock-manager-42']!, orders['900']!, 'READY')
        .allowed,
    ).toBe(true);
    expect(
      authorizeStatusChange(actors['mock-manager-42']!, orders['900']!, 'PAID')
        .allowed,
    ).toBe(false);
  });
});
