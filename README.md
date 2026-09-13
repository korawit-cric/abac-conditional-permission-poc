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

## Understand the policy layers

**A permission names an action, not a resource.** `order.refund` says that a role may attempt refunds. It does not say which order, store, tenant, amount, or state is eligible. Giving `STORE_MANAGER` this permission is the RBAC step. The ABAC step checks the facts of the request:

| Attribute source | Examples used in this PoC                                                       | Question it answers                              |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ |
| Actor (subject)  | `role`, `tenantId`, `storeIds`, `region`, `customerId`, `refundLimit`           | Who is acting, and what scope is assigned?       |
| Order (resource) | `tenantId`, `storeId`, `region`, `customerId`, `status`, `total`                | What object is being acted on?                   |
| Action           | `order.read`, `order.update_status`, `order.refund`, requested next status      | What does the caller want to do?                 |
| Environment      | Not modeled here; examples include time, trusted device, network, or risk level | Is this action allowed under current conditions? |

For a refund, the policy is effectively:

```text
ALLOW when role grants order.refund
  AND actor.tenantId == order.tenantId
  AND order.storeId is in actor.storeIds
  AND actor.region == order.region
  AND order.status == PAID
  AND order.total <= actor.refundLimit
```

This is why separate roles such as `STORE_MANAGER_TH_NORTH_NIGHT_SHIFT` are usually a poor way to express every condition. Roles describe broad responsibilities; attributes express the changing details. An order's status and total can change without inventing another role.

**Business rules are checked after access scope.** A Store 42 manager may request `PREPARING -> READY` for order 900. The role, tenant, store, and region checks pass, then the transition rule passes. `PREPARING -> PAID` fails the transition rule even for that manager. The route returns a simulated result only after all checks pass.

## Tenant boundaries and data access

The client cannot choose its own authorized tenant or store. Order 903 deliberately has Store 10 but belongs to `other-company`; a Store 10 manager in `thai-food` still receives `403`. Both tenant **and** store scope matter. Customer ownership is a separate restriction: a customer with `order.read` can read their own order, not another customer's order in the same tenant.

The fixture-based routes load an order and then authorize it. With a real database, scope the lookup or mutation itself. A conceptual query is:

```sql
SELECT * FROM orders
WHERE id = :order_id
  AND tenant_id = :authenticated_tenant_id
  AND store_id IN (:authorized_store_ids);
```

For a customer-owned order, constrain `customer_id` instead. Avoid fetching by order ID alone and trusting a `tenantId` or `storeId` supplied by the browser. For sensitive writes, make the authorization check and update consistent in one transaction; recheck mutable facts such as status and total at the point of mutation. The PoC has no database or real mutation, so it does not demonstrate this concurrency protection.

## Failure responses, freshness, and evidence

`401` means the request has no valid application session. The caller can log in or refresh authentication if that flow exists. `403` means the actor is known but the policy denies this operation; repeating login will not grant the missing permission. The examples return a denial reason to help learning. A production API may use less specific public errors while retaining detailed internal audit data.

Authorization data can become stale if roles are copied into long-lived tokens. This PoC stores only subject and expiry in its one-hour cookie and resolves the role and attributes on each request. Because that lookup uses a fixed code fixture, there is no live admin role editor or immediate session revocation. A real system can use a central user/permission lookup, short-lived credentials, a permission-version check, or revocable sessions according to how quickly access changes must take effect.

Sensitive successful changes and denials should leave useful evidence: actor ID, action, resource ID, tenant/store, outcome, timestamp, request ID, and relevant before/after values. The PoC has no audit log because it performs no durable business change. Logging should be added alongside the real mutation, without leaking private data into public error responses.

Use RBAC when job responsibilities mostly determine access. Add ABAC when a decision depends on the resource or current context, as it does for store assignment and refund amount here. Per-document sharing is often better expressed with an ACL or relationship model. An external OAuth scope limits delegated API access, but the resource server must still perform its own user, tenant, and resource checks.

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
