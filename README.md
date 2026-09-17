# Conditional Permission Access PoC

This repository demonstrates **RBAC + ABAC authorization** with the Monex Turbo-style application layout:

- **Next.js** owns the browser experience and mock login flow.
- **NestJS** is the authoritative application API.
- **Prisma + PostgreSQL** store users, roles, permission grants, store assignments, and orders.
- **`@repo/api-client`** shares typed, runtime-independent endpoint contracts.
- **Turborepo + npm workspaces** build and run the applications and packages together.

The core lesson is that a frontend never grants access. NestJS authenticates the request, loads current authorization data from PostgreSQL, checks the role permission, and puts tenant and resource conditions into Prisma queries before returning or changing an order.

The local identity provider is a teaching mock. It does not connect to ThaiD and does not authenticate a real person.

## What changed from the original authentication PoC

The original version kept demo actors, orders, and authorization rules inside the Next.js application. This version moves the authorization boundary into the normal backend stack:

1. Actors, roles, permissions, store assignments, and orders are PostgreSQL records.
2. NestJS decrypts and validates the application session cookie.
3. NestJS resolves the session subject to the current database user.
4. Role permissions come from `roles`, `permissions`, and `role_permissions`.
5. Tenant, region, store, customer ownership, order state, and refund limit are included in Prisma query conditions.
6. Next.js no longer exposes local `/api/orders/*` authorization routes.
7. Shared order endpoint definitions live in `@repo/api-client`.
8. A checked-in Prisma migration and repeatable seed create the demonstration data.

## System architecture

```text
┌──────────────────────────────── Browser ────────────────────────────────┐
│                                                                        │
│  1. Start mock login                                                   │
│  2. Carry HttpOnly cookies                                             │
│  3. Render the dashboard                                               │
│  4. Call NestJS with credentials                                       │
│                                                                        │
└──────────────────────┬───────────────────────────┬─────────────────────┘
                       │                           │
                       v                           v
          ┌──────── Next.js :3000 ───────┐   ┌──────── NestJS :3001 ────────┐
          │                              │   │                               │
          │ mock provider                │   │ validate app_session          │
          │ state + PKCE validation      │   │ load current actor            │
          │ create app_session           │   │ check named permission        │
          │ dashboard presentation       │   │ enforce resource conditions   │
          │ server/client fetch adapters │   │ validate DTO and Origin       │
          │                              │   │                               │
          └──────────────────────────────┘   └──────────────┬────────────────┘
                                                           │ Prisma
                                                           v
                                               ┌──── PostgreSQL :5433 ────┐
                                               │ users                    │
                                               │ roles + permissions      │
                                               │ user/store assignments   │
                                               │ stores + orders          │
                                               └──────────────────────────┘
```

### Trust boundaries

The browser is allowed to provide:

- the selected mock login persona during this demonstration;
- the order ID in the URL;
- the requested next order status;
- the application session cookie that the server previously issued.

The browser is **not** trusted to provide its role, tenant, customer ID, assigned stores, region, refund limit, or permission list. NestJS obtains all of those values from PostgreSQL using the authenticated session subject.

The dashboard shows authorization decisions for teaching purposes. Those labels do not protect data. Every real order endpoint performs authorization again inside NestJS and Prisma.

## Repository layout

```text
apps/
  web/                         Next.js UI, mock provider, login callback
  api/                         NestJS controllers, services, DTOs, auth
  db/                          PostgreSQL Docker Compose service
packages/
  prisma/                      Prisma schema, client, migration, seed
  api-client/                  Shared endpoint contracts and response types
  ui/                          Shared UI package
  icons/                       Shared generated icons
  eslint-config/               Shared lint configuration
  jest-config/                 Shared test configuration
  typescript-config/           Shared TypeScript configuration
```

The authorization-specific paths are:

- [`apps/api/src/auth/session.service.ts`](apps/api/src/auth/session.service.ts)
- [`apps/api/src/orders/orders.controller.ts`](apps/api/src/orders/orders.controller.ts)
- [`apps/api/src/orders/orders.service.ts`](apps/api/src/orders/orders.service.ts)
- [`apps/api/src/orders/dto/update-order-status.dto.ts`](apps/api/src/orders/dto/update-order-status.dto.ts)
- [`packages/prisma/prisma/schema.prisma`](packages/prisma/prisma/schema.prisma)
- [`packages/prisma/prisma/seed.ts`](packages/prisma/prisma/seed.ts)
- [`packages/api-client/src/orders.ts`](packages/api-client/src/orders.ts)
- [`apps/web/app/dashboard/page.tsx`](apps/web/app/dashboard/page.tsx)

## Authentication flow

Authentication establishes who is acting. It does not grant access to an order by itself.

```text
Browser             Next.js                 Mock provider
   |                   |                          |
   | GET /auth/login   |                          |
   |------------------>| create state + verifier  |
   |                   | set oauth_attempt cookie |
   |<------------------| redirect                 |
   |--------------------------------------------->|
   |<-------------- authorization code + state ---|
   | GET /auth/callback                           |
   |------------------>| verify state + expiry    |
   |                   | exchange code + verifier |
   |                   |<------ mock identity ----|
   |                   | map known subject        |
   |<------------------| set app_session cookie   |
```

### Temporary login cookie

`oauth_attempt` contains the random state, PKCE verifier, and expiration. It is encrypted and authenticated with AES-256-GCM and lasts five minutes. The callback clears it after the exchange.

### Application session cookie

`app_session` contains only:

```ts
{
  sub: string;
  name: string;
  expiresAt: number;
}
```

It does not contain role or permission claims. Next.js and NestJS share `AUTH_COOKIE_SECRET`, so NestJS can validate the cookie produced by Next.js. NestJS uses `sub` to reload current access data from PostgreSQL on every request.

This makes role, store-assignment, region, and refund-limit changes effective on the next request. The cookie itself remains valid until expiration because this PoC does not have a central revocable session table.

## Database authorization model

The Prisma schema represents broad responsibility and conditional scope separately.

```text
User ── belongs to ──> Role ──< RolePermission >── Permission
  |
  └──< UserStore >── Store ──< Order
```

### Models

- `User` stores the provider subject, tenant, region, optional customer ID, refund limit, and assigned role.
- `Role` stores one broad job responsibility such as `STORE_MANAGER`.
- `Permission` stores named capabilities such as `order.refund`.
- `RolePermission` is the many-to-many grant table.
- `Store` belongs to a tenant and region.
- `UserStore` assigns staff and managers to specific stores.
- `Order` carries the resource attributes used by policy: tenant, store, region, customer, status, and total.

### Seeded permissions

```text
CUSTOMER
  order.read

STORE_STAFF
  order.read
  order.update_status

STORE_MANAGER
  order.read
  order.update_status
  order.refund
  inventory.adjust

HQ_ADMIN
  promotion.manage
```

`HQ_ADMIN` deliberately does not inherit every store permission. An administrative title is not treated as an authorization bypass.

### Seeded actors

- `mock-customer`: customer `c-1` in tenant `thai-food`.
- `mock-staff-10`: staff assigned to Store 10.
- `mock-manager-10`: Store 10 manager with a refund limit of 500.
- `mock-manager-42`: Store 42 manager with a refund limit of 500.
- `mock-hq`: HQ administrator with promotion permission only.

### Seeded orders

- Order `900`: Store 42, `PREPARING`, total 300, owned by customer `c-1`.
- Order `901`: Store 10, `PAID`, total 300.
- Order `902`: Store 10, `PAID`, total 800.
- Order `903`: another tenant, `PAID`, total 100.

These records create predictable allowed and denied cases.

## How NestJS authenticates a request

Every order controller method receives the raw `Cookie` header and passes it to `SessionService.authenticate()`.

The service performs these steps:

1. Find the `app_session` cookie.
2. Derive the AES key from `AUTH_COOKIE_SECRET` and the `app-session` purpose.
3. Verify the AES-GCM authentication tag while decrypting.
4. Parse the session and reject an expired or malformed value with `401`.
5. Query `users` by `session.sub`.
6. Include the user's role, role permissions, permission records, and assigned stores.
7. Convert the result into a trusted `AuthenticatedActor` used by order policies.

A session for a subject that no longer exists also returns `401`.

## How RBAC and ABAC work together

RBAC answers the broad question: **may this role attempt this action?**

```ts
requirePermission(actor, 'order.refund');
```

ABAC answers the specific question: **may this actor perform the action on this resource under these conditions?**

For a refund, the effective policy is:

```text
role grants order.refund
AND actor tenant equals order tenant
AND order store is assigned to actor
AND actor region equals order region
AND order status is PAID
AND order total is within actor refund limit
```

The permission is loaded from PostgreSQL and checked in NestJS. Resource conditions are included in the Prisma `where` clause, so the database operation only matches authorized rows.

## How each endpoint works

### `GET /orders/access-summary`

Used by the dashboard to explain the current actor's access.

1. Authenticate the cookie.
2. Load current role, permissions, and stores.
3. Check whether the role grants each example permission.
4. Run scoped `count` queries for the example orders.
5. Return actor information and allow/deny explanations.

This endpoint is educational. Real order endpoints still enforce their own policy.

### `GET /orders/:id`

1. Require `order.read`.
2. Build a base filter using order ID, authenticated tenant, and authenticated region.
3. For a customer, add the authenticated `customerId`.
4. For staff and managers, add `storeId IN actor.storeIds`.
5. Query with `findFirst`.
6. Return `403` when no row is inside the authorized scope.

Conceptually, a manager read becomes:

```sql
SELECT * FROM orders
WHERE id = :order_id
  AND tenant_id = :actor_tenant
  AND region = :actor_region
  AND store_id IN (:actor_store_ids);
```

The order ID comes from the URL. Every other parameter comes from the authenticated database actor.

### `PATCH /orders/:id`

Request body:

```json
{ "status": "READY" }
```

1. Validate the DTO against the `OrderStatus` enum.
2. Require the configured frontend `Origin`.
3. Authenticate the actor.
4. Require `order.update_status`.
5. Read the order with tenant, region, and assigned-store scope.
6. Validate the state transition:
   - `PAID -> PREPARING`
   - `PREPARING -> READY`
7. Run `updateMany` with the same scope **and the previously read status**.
8. Require exactly one updated row.

Including the old status in the update prevents a concurrent order change from silently passing the earlier validation.

### `POST /orders/:id/refund`

1. Require the configured frontend `Origin`.
2. Authenticate the actor.
3. Require `order.refund`.
4. Run one conditional update containing:
   - order ID;
   - authenticated tenant;
   - authenticated region;
   - assigned store IDs;
   - current status `PAID`;
   - `total <= actor.refundLimit`.
5. Change the status to `REFUNDED` only when exactly one row matches.
6. Return `403` when any permission or resource condition fails.

Conceptually:

```sql
UPDATE orders
SET status = 'REFUNDED'
WHERE id = :order_id
  AND tenant_id = :actor_tenant
  AND region = :actor_region
  AND store_id IN (:actor_store_ids)
  AND status = 'PAID'
  AND total <= :actor_refund_limit;
```

This is stronger than loading an order by ID and relying only on a previous application check.

## Why authorization is split between NestJS and SQL

The layers have different responsibilities:

- **Next.js:** display state and send requests.
- **NestJS:** validate identity, choose the required named permission, apply business rules, and translate failures into HTTP responses.
- **Prisma/PostgreSQL:** ensure the selected or mutated row satisfies tenant and resource constraints.

The database query is not built from frontend-provided authorization attributes. NestJS supplies values loaded from the authenticated user record.

PostgreSQL row-level security is not configured. RLS could add another database boundary, but it would supplement rather than replace clear API policy and tests.

## Shared endpoint contracts and frontend fetch

`packages/api-client` contains plain endpoint descriptions and response types. It has no React, Next.js, NestJS, or fetch dependency.

```ts
ordersApi.detail('901');
ordersApi.updateStatus('901', 'PREPARING');
ordersApi.refund('901');
ordersApi.accessSummary();
```

The frontend owns two fetch implementations:

- `clientFetch()` uses `credentials: 'include'` for browser calls to port 3001.
- `serverFetch()` forwards the incoming Next.js cookie when a Server Component calls NestJS.

The dashboard is a Server Component. It calls `ordersApi.accessSummary()` through `serverFetch()`, renders the returned actor and decisions, and redirects to the home page when authentication fails.

## CORS and mutation origin checks

NestJS allows credentialed CORS only from `WEB_ORIGIN`, which defaults to `http://localhost:3000`.

CORS controls which browser frontend can read API responses. The controller also checks the `Origin` header on `PATCH` and `POST`, because mutation protection must not depend only on response visibility. The `app_session` cookie is HttpOnly and SameSite=Lax; JavaScript cannot read it directly.

## HTTP responses

- `200`: authenticated, permission granted, resource conditions matched, operation completed.
- `400`: DTO validation failed, such as an unknown status.
- `401`: session is missing, invalid, expired, or refers to a deleted user.
- `403`: role permission is missing, origin is invalid, resource is outside tenant/store/owner scope, a transition is invalid, or refund conditions fail.

A client may start login or refresh authentication after `401`. Re-authenticating after an ordinary `403` does not grant access.

## Environment configuration

Copy the example file:

```sh
cp .env.example .env
```

Important values:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/monex-root-template-v2-db?schema=public"
API_PORT=3001
NEXT_PUBLIC_API="http://localhost:3001"
WEB_ORIGIN="http://localhost:3000"
AUTH_COOKIE_SECRET="replace-with-at-least-32-random-base64url-bytes"
```

Generate a local cookie secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The repository's environment-distribution script links the root `.env` into applications and packages so Next.js, NestJS, and Prisma receive consistent values.

## Install and run

Requirements:

- Node.js 22.12 or newer;
- npm;
- Docker with Docker Compose.

Install dependencies:

```sh
npm install
```

Start PostgreSQL:

```sh
npm run db:start
```

Apply the migration and seed demo data:

```sh
npm run db:migrate
npm run db:seed
```

Start Next.js and NestJS through Turborepo:

```sh
npm run dev
```

Open:

- Frontend: <http://localhost:3000>
- Swagger UI: <http://localhost:3001/api>

Stop PostgreSQL when finished:

```sh
npm run db:stop
```

## Try the demo

Choose an identity on the home page and inspect the dashboard decisions. You can also call NestJS directly from the browser console.

### Store 10 manager

```js
const api = 'http://localhost:3001';

await fetch(`${api}/orders/901`, {
  credentials: 'include',
}).then(async (response) => [response.status, await response.json()]);
// 200: order belongs to assigned Store 10

await fetch(`${api}/orders/900`, {
  credentials: 'include',
}).then(async (response) => [response.status, await response.json()]);
// 403: order belongs to Store 42

await fetch(`${api}/orders/901/refund`, {
  method: 'POST',
  credentials: 'include',
}).then(async (response) => [response.status, await response.json()]);
// 200: PAID, total 300, limit 500; status becomes REFUNDED

await fetch(`${api}/orders/902/refund`, {
  method: 'POST',
  credentials: 'include',
}).then(async (response) => [response.status, await response.json()]);
// 403: total 800 exceeds limit 500
```

### Store 42 manager

Order `900` is inside the assigned store. Changing it from `PREPARING` to `READY` is allowed:

```js
await fetch('http://localhost:3001/orders/900', {
  method: 'PATCH',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'READY' }),
}).then(async (response) => [response.status, await response.json()]);
```

### Customer

The customer can read order `900` because its `customerId` is `c-1`. The same customer cannot read an order owned by `c-2`, even if it belongs to the same tenant.

### HQ admin

HQ admin has `promotion.manage`, but no order permission. Order reads, updates, and refunds return `403`.

Mutations change PostgreSQL data. Restore the original scenarios with:

```sh
npm run db:seed
```

## Migration, seed, and testing

The initial authorization migration is checked in under:

```text
packages/prisma/prisma/migrations/20260917000000_add_conditional_authorization/
```

Useful commands:

```sh
npm run db:generate   # regenerate the Prisma client
npm run db:migrate    # create/apply development migrations
npm run db:seed       # upsert roles, grants, actors, stores, and orders
npm run db:studio     # inspect data using Prisma Studio
npm run build         # build packages, NestJS, and Next.js
npm run test          # run workspace tests
npm run lint          # run workspace lint checks
```

The focused NestJS unit tests verify that:

- tenant, region, and assigned stores are included in read queries;
- all refund conditions appear in one update query;
- a missing named permission prevents the database mutation call.

## Authorization freshness and auditability

Authorization data is reloaded for every API request, so changing a role grant, store assignment, region, or refund limit affects the next decision. The session itself cannot be immediately revoked because it is a stateless encrypted cookie.

A production system should add an audit table or event pipeline for sensitive operations. Useful evidence includes actor ID, action, resource ID, tenant/store, result, timestamp, request ID, and relevant before/after values. Audit records should be written consistently with the business mutation and should not expose sensitive internal policy details in public error responses.

## Deliberate limits

This PoC intentionally leaves out:

- a real ThaiD/OIDC integration;
- server-side revocable sessions;
- authorization audit-log persistence;
- PostgreSQL row-level security;
- trusted-device, network, time-window, country, and risk attributes;
- endpoints for `promotion.manage` and `inventory.adjust`;
- production-grade error normalization and observability.

Those additions can build on the same separation: identity enters through a validated session, NestJS selects the policy, and Prisma/PostgreSQL constrain access to authorized rows.
