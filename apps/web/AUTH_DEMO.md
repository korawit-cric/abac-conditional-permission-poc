# OAuth + encrypted-cookie demo

This demo runs inside the existing Next.js app in the Turborepo. It follows the external identity and encrypted login-state cookie architecture described in the source authentication guide.

## Run

1. Install workspace dependencies with `npm install`.
2. Set `AUTH_COOKIE_SECRET` in `apps/web/.env.local` to at least 32 random bytes encoded as base64url. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
3. Run `npm run dev --workspace=web` and open http://localhost:3000.
4. Choose a demo identity, then inspect the redirect, callback, cookies, and protected dashboard in browser developer tools.

No database, NestJS API, Redis, or real ThaiD credentials are required for this isolated demonstration.

## Conditional authorization (guide section 26)

The local provider can return five fixed mock identities. The callback maps the provider subject to an application user. Each protected request resolves that user's current role and attributes from a server-side fixture. The encrypted cookie holds identity and expiry, not role or permission claims. This models authorization freshness without requiring a database for the POC.

Roles grant broad capabilities: customer can read owned orders; store staff can read and update assigned-store orders; store manager also can refund; HQ admin has a separate promotion permission and does not inherit store operations. Server policies additionally enforce tenant, assigned store, region, customer ownership, PAID refund status, refund limit, and valid status transitions. These checks run in `/api/orders/[id]` and `/api/orders/[id]/refund`, not just in the dashboard. Missing/expired authentication returns 401; a known user failing a policy returns 403. State-changing examples require a same-origin `Origin` header. Orders are fixed fixtures, and permitted PATCH/refund operations return `simulated: true` without persistence or payment effects.

For example, after logging in as Store 10 manager, test the API with browser `fetch`:

```js
await fetch('/api/orders/901/refund', { method: 'POST' }).then(async (r) => [
  r.status,
  await r.json(),
]); // 200
await fetch('/api/orders/902/refund', { method: 'POST' }).then(async (r) => [
  r.status,
  await r.json(),
]); // 403: limit
await fetch('/api/orders/900').then(async (r) => [r.status, await r.json()]); // 403: different store
await fetch('/api/orders/901', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'PREPARING' }),
}).then(async (r) => [r.status, await r.json()]); // 200 simulated
```

In a real integration, store users, role assignments, and order attributes in durable storage; resolve authorization in the same transaction or scoped query as the business mutation; record sensitive decisions and before/after changes in an audit log. A process-local fixture cannot provide cross-instance consistency, revocation, or a durable audit trail.

## Flow

`/auth/login` generates random state and a PKCE verifier. It stores them for five minutes in an AES-256-GCM encrypted, authenticated, HttpOnly, SameSite=Lax cookie and redirects to `/mock-provider/authorize` with the S256 challenge. The mock provider issues a short-lived code. `/auth/callback` decrypts the attempt cookie, checks expiry and constant-time state equality, and exchanges the code with `/mock-provider/token` using the verifier. After identity mapping, it clears the attempt cookie and issues a separate one-hour encrypted app session cookie. `/dashboard` validates that cookie server-side. Logout clears it.

The cookie is `Secure` in production; HTTP localhost development requires it to be unset. The secret must be stable across app instances and rotated deliberately. Do not place the secret in source control.

## Scope and production integration

The provider routes are deliberately **not ThaiD**. They do not authenticate a person and use a simplified JSON identity response. A real ThaiD adapter must use registered endpoints, exact redirect URI, the required client authentication, and validate its OIDC ID token or userinfo response according to the ThaiD contract (issuer, audience, signature, nonce, expiration, and claim mapping where applicable). Never trust callback query parameters as identity.

This stateless example does not make authorization codes one-time and cannot immediately revoke a stolen app cookie or reliably consume a login attempt across parallel requests. For production, use one-time code storage on the provider side and a shared session/login-attempt store or an equivalent replay/revocation design. Expand CSRF protection beyond the demo origin check as appropriate, and add audit logging, rate limits, and session/key rotation.
