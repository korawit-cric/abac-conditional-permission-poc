# Conditional Permission Access PoC

This repository demonstrates **RBAC + ABAC authorization** with the Monex Turbo-style application layout:

- **Next.js** owns the browser experience and protected-page rendering.
- **NestJS** owns OAuth state/PKCE, callbacks, revocable sessions, and the application API.
- **Prisma + PostgreSQL** store users, revocable sessions, roles, permission grants, store assignments, and orders.
- **`@repo/api-client`** shares typed, runtime-independent endpoint contracts.
- **Turborepo + npm workspaces** build and run the applications and packages together.

The core lesson is that a frontend never grants access. NestJS authenticates the request, loads current authorization data from PostgreSQL, checks the role permission, and puts tenant and resource conditions into Prisma queries before returning or changing an order.

The local identity provider is a teaching mock. It does not connect to ThaiD and does not authenticate a real person.

## What changed from the original authentication PoC

The original version kept demo actors, orders, and authorization rules inside the Next.js application. This version moves the authorization boundary into the normal backend stack:

1. Actors, roles, permissions, store assignments, and orders are PostgreSQL records.
2. NestJS owns the login redirect, state/PKCE validation, callback, and session creation.
3. Each login creates an `auth_sessions` row containing a SHA-256 token hash.
4. NestJS decrypts the cookie token, hashes it, and accepts only an active database session.
5. Role permissions come from `roles`, `permissions`, and `role_permissions`.
6. Tenant, region, store, customer ownership, order state, and refund limit are included in Prisma query conditions.
7. The old frontend `authorize()` function, role map, actor fixtures, and order fixtures were removed.
8. Next.js no longer exposes local `/api/orders/*` authorization routes.
9. Shared order endpoint definitions live in `@repo/api-client`.
10. Current-session and all-device logout revoke database rows immediately.
11. A checked-in Prisma migration and repeatable seed create the demonstration data.

## System architecture

```text
Browser
  |-- GET /auth/login ---------------------------> NestJS :3001
  |                                                 create state + PKCE
  |<-- oauth_attempt cookie + provider redirect --|
  |-- follow mock-provider redirect -------------> NestJS mock provider
  |<-- code + state callback ---------------------|
  |-- GET /auth/callback ------------------------> NestJS
  |                                                 validate attempt
  |                                                 create AuthSession row
  |<-- encrypted app_session token + /dashboard --|
  |
  |-- render /dashboard -------------------------> Next.js :3000
                                                    forwards cookie to NestJS
                                                    renders API decisions

NestJS -> Prisma -> PostgreSQL
                    users, roles, permissions, assignments,
                    auth_sessions, stores, and orders
```

Next.js does not validate OAuth state, exchange authorization codes, create application sessions, or revoke sessions. Those operations are backend-owned by NestJS.

### Trust boundaries

The browser is allowed to provide:

- the selected mock login persona during this demonstration;
- the order ID in the URL;
- the requested next order status;
- the application session cookie that the server previously issued.

The browser is **not** trusted to provide its role, tenant, customer ID, assigned stores, region, refund limit, or permission list. NestJS obtains all of those values from PostgreSQL using the authenticated session subject.

The dashboard shows authorization decisions for teaching purposes. Those labels do not protect data. Every real order endpoint performs authorization again inside NestJS and Prisma.

### No frontend permission gateway

There is no `authorize(actor, permission, order)` function in `apps/web`, and Next.js does not maintain a role-to-permission map. The previous `apps/web/lib/auth/authorization.ts` implementation was deleted.

The frontend has only two authorization-related responsibilities:

1. Send the HttpOnly application cookie automatically when it calls NestJS.
2. Render the allow, deny, `401`, or `403` result returned by NestJS.

Hiding a button can improve the interface, but it can never authorize an operation. A caller can bypass the page and invoke the API directly, so each NestJS endpoint must authenticate and authorize every request independently.

The authoritative gateway is:

```text
NestJS controller
  -> SessionService authenticates app_session
  -> PostgreSQL supplies current actor attributes and role grants
  -> OrdersService requires the named permission
  -> Prisma query constrains the permitted resource rows
  -> PostgreSQL returns or updates zero or one matching row
```

Even `GET /orders/access-summary` is only an explanatory API response. The dashboard does not reuse its result as proof that a later read, status update, or refund is allowed. The later endpoint repeats the complete server-side decision against current database data.

## Repository layout

```text
apps/
  web/                         Next.js UI and protected-page rendering
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

- [`apps/api/src/auth/auth.controller.ts`](apps/api/src/auth/auth.controller.ts)
- [`apps/api/src/auth/auth.service.ts`](apps/api/src/auth/auth.service.ts)
- [`apps/api/src/auth/session.service.ts`](apps/api/src/auth/session.service.ts)
- [`apps/api/src/orders/orders.controller.ts`](apps/api/src/orders/orders.controller.ts)
- [`apps/api/src/orders/orders.service.ts`](apps/api/src/orders/orders.service.ts)
- [`apps/api/src/orders/dto/update-order-status.dto.ts`](apps/api/src/orders/dto/update-order-status.dto.ts)
- [`packages/prisma/prisma/schema.prisma`](packages/prisma/prisma/schema.prisma)
- [`packages/prisma/prisma/seed.ts`](packages/prisma/prisma/seed.ts)
- [`packages/api-client/src/orders.ts`](packages/api-client/src/orders.ts)
- [`apps/web/app/dashboard/page.tsx`](apps/web/app/dashboard/page.tsx)

## Authentication and session flow

Authentication establishes who is acting. It does not grant access to an order by itself.

### 1. Begin login

The home page links to `GET /auth/login` on NestJS. NestJS creates random state and a PKCE verifier, encrypts them into a five-minute `oauth_attempt` cookie, and redirects to the mock provider with the S256 challenge.

The encrypted attempt cookie avoids a login-attempt database table. State and PKCE are still created and validated by backend code, never by browser JavaScript.

### 2. Validate the callback

The mock provider redirects to NestJS `/auth/callback` with an authorization code and state. NestJS:

1. decrypts `oauth_attempt`;
2. checks its expiry;
3. compares state using a constant-time comparison;
4. exchanges the code using the stored PKCE verifier;
5. maps the verified subject to an existing application `User`.

### 3. Create a revocable session

NestJS generates a new random 32-byte session token and a one-hour expiration. It stores only `SHA-256(token)` in PostgreSQL:

```text
AuthSession
  id          internal row ID
  tokenHash   SHA-256 hash; unique
  userId      related application user
  expiresAt   authoritative database expiry
  revokedAt   null while active
  createdAt   creation timestamp
```

The raw token and expiry are encrypted into the HttpOnly `app_session` cookie. A stolen database does not reveal reusable raw session tokens, while a copied browser cookie can be invalidated by revoking its database row.

Every login creates a separate row, so one user can have several independently tracked browser or device sessions.

### 4. Validate protected requests

For every order request, `SessionService`:

1. reads and decrypts `app_session`;
2. rejects an expired cookie payload;
3. hashes the raw token;
4. loads the matching `AuthSession` and related `User`;
5. requires `revokedAt` to be null and database `expiresAt` to be in the future;
6. loads current role grants and store assignments for authorization.

### 5. Revoke sessions

- `POST /auth/logout` sets `revokedAt` on the current active session and clears its cookie.
- `POST /auth/logout-all` resolves the current active session's `userId`, sets `revokedAt` on every unrevoked session belonging to that user, and clears the current cookie.

Clearing a cookie is browser cleanup. PostgreSQL revocation is authoritative: a copied cookie is rejected on its next request after the row is revoked.

The authentication endpoints are:

- `GET /auth/login`: create the protected OAuth attempt and redirect to the provider.
- `GET /auth/callback`: validate state/PKCE, create `AuthSession`, set `app_session`, and redirect to Next.js.
- `POST /auth/logout`: revoke only the session represented by the current cookie.
- `POST /auth/logout-all`: revoke every unrevoked session row belonging to the current authenticated user.

## Database authorization model

The Prisma schema represents broad responsibility and conditional scope separately.

```text
User ── belongs to ──> Role ──< RolePermission >── Permission
  |
  |──< AuthSession
  |
  └──< UserStore >── Store ──< Order
```

### Models

- `User` stores the provider subject, tenant, region, optional customer ID, refund limit, assigned role, and session relationship.
- `AuthSession` stores a hashed opaque token, user relationship, expiration, and optional revocation timestamp.
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

Every order controller passes the raw `Cookie` header to `SessionService.authenticate()`. The cookie is only a protected bearer token container; PostgreSQL decides whether the login is still active.

The service decrypts the cookie, hashes its random token, and performs an `auth_sessions` lookup that includes the related user, role grants, permission records, and assigned stores. A missing, expired, or revoked row returns `401`.

A valid row becomes a trusted `AuthenticatedActor` containing the current database values for tenant, region, refund limit, customer ID, role, permissions, and store IDs. None of these authorization attributes are accepted from the frontend or cached in the session cookie.

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
API_PUBLIC_URL="http://localhost:3001"
NEXT_PUBLIC_API="http://localhost:3001"
WEB_ORIGIN="http://localhost:3000"
WEB_URL="http://localhost:3000"
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

The authorization and revocable-session migrations are checked in under:

```text
packages/prisma/prisma/migrations/20260917000000_add_conditional_authorization/
packages/prisma/prisma/migrations/20260918000000_add_revocable_sessions/
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
- a missing named permission prevents the database mutation call;
- session creation stores only a token hash;
- revoked sessions are rejected;
- all-device logout revokes every unrevoked row for the current user.

## Authorization freshness and auditability

Authorization data is reloaded for every API request, so changing a role grant, store assignment, region, or refund limit affects the next decision. Sessions are also checked in PostgreSQL on every request, so current-session and all-device revocation take effect immediately.

A production system should add an audit table or event pipeline for sensitive operations. Useful evidence includes actor ID, action, resource ID, tenant/store, result, timestamp, request ID, and relevant before/after values. Audit records should be written consistently with the business mutation and should not expose sensitive internal policy details in public error responses.

## Roll back to the stateless session version

Commit `c0a58bc` (`docs: explain NestJS and PostgreSQL authorization flow`) is the last committed baseline before the application session was changed to a PostgreSQL-backed, revocable session. At that baseline:

- Next.js created the encrypted `app_session` cookie after the mock callback;
- the cookie contained the user subject, display name, and expiry;
- NestJS decrypted the cookie and loaded authorization data by subject;
- there was no `auth_sessions` table or lookup;
- clearing the browser cookie was logout;
- a copied cookie remained valid until its one-hour expiry;
- revoking all sessions for one user was impossible.

To inspect or run that exact version without changing the current branch:

```sh
git switch --detach c0a58bc
```

Return to the current branch with:

```sh
git switch main
```

For a rollback on a shared branch, prefer reverting the revocable-session implementation commit after it is committed:

```sh
git revert <revocable-session-change-commit>
```

Reverting preserves shared history. Do not use `git reset --hard` on a shared `main` branch. The rollback must remove the NestJS login/session endpoints, restore the former Next.js login routes, remove the `AuthSession` Prisma model and migration, and restore stateless-cookie validation in `SessionService`; reverting only the database migration would leave the applications incompatible.

If the revocable-session migration has already reached a database, treat schema rollback separately. The application can stop using `auth_sessions` while leaving the table in place, which is safer than immediately dropping session history. Drop it only through a reviewed follow-up migration when its data is no longer needed.

## Deliberate limits

This PoC intentionally leaves out:

- a real ThaiD/OIDC integration;
- authorization audit-log persistence;
- PostgreSQL row-level security;
- trusted-device, network, time-window, country, and risk attributes;
- endpoints for `promotion.manage` and `inventory.adjust`;
- production-grade error normalization and observability.

Those additions can build on the same separation: identity enters through a validated session, NestJS selects the policy, and Prisma/PostgreSQL constrain access to authorized rows.
