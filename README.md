# Conditional permission access PoC

A runnable knowledge-sharing example of **RBAC + ABAC** in a store/order application. It follows section 26 of the supplied authentication and authorization guide: identify the actor, check whether their role grants the requested permission, then check whether this particular resource and context allow the action.

The Next.js app uses a local mock identity provider to create a browser session. It does **not** connect to ThaiD or authenticate a real person. The login flow exists to give the authorization examples a server-validated identity; this README focuses on access decisions.

## The decision in one request

```text
PATCH /api/orders/900 { "status": "READY" }
  1. Is there a valid app session?                 No -> 401
  2. Does the role grant order.update_status?      No -> 403
  3. Is the order in the actor's tenant?           No -> 403
  4. Is its store assigned, and region matched?    No -> 403
  5. Is PREPARING -> READY a valid transition?      No -> 403
  6. Return a simulated success
```

**RBAC** answers which kind of work a role can do. `STORE_STAFF` may read and update store orders; `STORE_MANAGER` may also refund. `HQ_ADMIN` has `promotion.manage` but does not automatically inherit store-order permissions. **ABAC** narrows a granted permission using the actor, order, and action: tenant, assigned store, region, customer ownership, order status, refund limit, and allowed status transition. A role alone never grants access to every order.

| Demo actor       | Broad role permission                                 | Resource condition that matters                                   |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Customer         | `order.read`                                          | May read only their own order in their tenant.                    |
| Store 10 staff   | `order.read`, `order.update_status`                   | May work only on assigned Store 10 orders in the matching region. |
| Store 10 manager | Staff permissions, `order.refund`, `inventory.adjust` | May refund only assigned-store **PAID** orders up to 500.         |
| Store 42 manager | Same manager permissions                              | Store 10 orders remain forbidden.                                 |
| HQ admin         | `promotion.manage`                                    | Does not gain order access merely from an admin title.            |

The mock provider returns a subject; the callback maps it to application identity. The encrypted session stores subject and expiry. Protected requests look up the actor's current role and attributes from server-side fixtures, so permissions are not frozen in a long-lived cookie. The API enforces authorization again for each operation; the dashboard's allow/deny labels are only an explanation of the same policy.

## Run the examples

Requires Node.js 22.12 or newer and npm. No database, NestJS API, Redis, or real ThaiD credentials are needed for this isolated PoC.

1. Run `npm install`.
2. Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
3. Set `AUTH_COOKIE_SECRET=<generated value>` in `apps/web/.env.local`.
4. Run `npm run dev --workspace=web` and open <http://localhost:3000>.
5. Choose a demo identity. The dashboard shows its role, assigned stores, and example decisions.

After logging in as **Store 10 manager**, run these in the browser console:

```js
// Allowed: paid order in assigned store, below refund limit.
await fetch('/api/orders/901/refund', { method: 'POST' }).then(async (r) => [
  r.status,
  await r.json(),
]);

// Denied: same store and paid status, but 800 exceeds the 500 limit.
await fetch('/api/orders/902/refund', { method: 'POST' }).then(async (r) => [
  r.status,
  await r.json(),
]);

// Denied: the order belongs to Store 42.
await fetch('/api/orders/900').then(async (r) => [r.status, await r.json()]);

// Allowed status transition for a Store 10 order.
await fetch('/api/orders/901', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'PREPARING' }),
}).then(async (r) => [r.status, await r.json()]);
```

The first and fourth requests return `200` with `simulated: true`; the others return `403` with a denial reason. Try the same requests as another identity to see how role and resource attributes interact. Without a valid session, protected routes return `401`; a `403` is a permission denial and should not trigger login refresh. State-changing routes also require a same-origin `Origin` header.

## Where to read the implementation

- [`apps/web/lib/auth/authorization.ts`](apps/web/lib/auth/authorization.ts) defines actors, role permissions, orders, and conditional policies.
- [`apps/web/lib/auth/authorization.test.ts`](apps/web/lib/auth/authorization.test.ts) checks role, ownership, tenant, store, refund, and transition cases.
- [`apps/web/app/api/orders/[id]/route.ts`](apps/web/app/api/orders/%5Bid%5D/route.ts) enforces reads and status changes.
- [`apps/web/app/api/orders/[id]/refund/route.ts`](apps/web/app/api/orders/%5Bid%5D/refund/route.ts) enforces refunds.
- [`apps/web/lib/auth/session.ts`](apps/web/lib/auth/session.ts) validates the application session and resolves its subject to current authorization data.
- [`apps/web/AUTH_DEMO.md`](apps/web/AUTH_DEMO.md) documents the mock login flow and production integration considerations.

## What the PoC deliberately simplifies

Orders and actors are fixed in-memory fixtures. PATCH and refund responses do not persist changes or move money. The `promotion.manage` permission illustrates a separate HQ capability; there is no promotion endpoint. Production code should store users, assignments, orders, and policies durably; scope database queries to the authorized tenant/store and make the policy check and mutation consistent. Record sensitive actions and before/after state in an audit log. Add a revocable session strategy if access removal must take effect immediately across instances, and use stronger CSRF controls appropriate to the deployed architecture. The mock login provider itself is not a ThaiD integration.
