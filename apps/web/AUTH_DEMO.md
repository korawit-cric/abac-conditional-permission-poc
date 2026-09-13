# OAuth + encrypted-cookie demo

This demo runs inside the existing Next.js app in the Turborepo. It follows the external identity and encrypted login-state cookie architecture described in the source authentication guide.

## Run

1. Install workspace dependencies with `npm install`.
2. Set `AUTH_COOKIE_SECRET` in `apps/web/.env.local` to at least 32 random bytes encoded as base64url. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
3. Run `npm run dev --workspace=web` and open http://localhost:3000.
4. Click **Start mock ThaiD login**, then inspect the redirect, callback, cookies, and protected dashboard in browser developer tools.

No database, NestJS API, Redis, or real ThaiD credentials are required for this isolated demonstration.

## Flow

`/auth/login` generates random state and a PKCE verifier. It stores them for five minutes in an AES-256-GCM encrypted, authenticated, HttpOnly, SameSite=Lax cookie and redirects to `/mock-provider/authorize` with the S256 challenge. The mock provider issues a short-lived code. `/auth/callback` decrypts the attempt cookie, checks expiry and constant-time state equality, and exchanges the code with `/mock-provider/token` using the verifier. After identity mapping, it clears the attempt cookie and issues a separate one-hour encrypted app session cookie. `/dashboard` validates that cookie server-side. Logout clears it.

The cookie is `Secure` in production; HTTP localhost development requires it to be unset. The secret must be stable across app instances and rotated deliberately. Do not place the secret in source control.

## Scope and production integration

The provider routes are deliberately **not ThaiD**. They do not authenticate a person and use a simplified JSON identity response. A real ThaiD adapter must use registered endpoints, exact redirect URI, the required client authentication, and validate its OIDC ID token or userinfo response according to the ThaiD contract (issuer, audience, signature, nonce, expiration, and claim mapping where applicable). Never trust callback query parameters as identity.

This stateless example does not make authorization codes one-time and cannot immediately revoke a stolen app cookie or reliably consume a login attempt across parallel requests. For production, use one-time code storage on the provider side and a shared session/login-attempt store or an equivalent replay/revocation design. RBAC/ABAC and tenant authorization are outside this demo; add them server-side if the real application needs them. Add CSRF protection to state-changing endpoints, audit logging, rate limits, and session/key rotation.
