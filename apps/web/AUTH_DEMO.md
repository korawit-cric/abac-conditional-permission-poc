# Mock login for the authorization PoC

Next.js hosts a local OAuth-style provider so the browser can obtain an application identity before calling the NestJS authorization API. It is a teaching stand-in, not ThaiD, and it does not authenticate a real person.

## Flow

1. `/auth/login` creates random state and a PKCE verifier.
2. Next.js stores them for five minutes in an AES-256-GCM encrypted, HttpOnly, SameSite=Lax cookie.
3. The local provider returns a short-lived authorization code and selected mock subject.
4. `/auth/callback` validates state and expiry, exchanges the code using the verifier, maps the known subject, and creates a separate one-hour `app_session` cookie.
5. The Next.js dashboard forwards that cookie to NestJS. NestJS decrypts it and loads the current actor, role, permissions, and assignments from PostgreSQL.

The application cookie contains identity and expiry, not authorization grants. Role and attribute changes in PostgreSQL are therefore applied on the next API request.

## Run

Follow the root [`README.md`](../../README.md) to configure the shared secret, start PostgreSQL, migrate and seed it, and run the workspace. Next.js and NestJS must use the same `AUTH_COOKIE_SECRET`.

## Production integration

A real ThaiD adapter must use registered endpoints, the exact redirect URI, required client authentication, and verified OIDC identity data, including signature, issuer, audience, expiry, nonce where applicable, and claim mapping. Callback query parameters are not identity.

The temporary login-state cookie cannot reliably consume an authorization attempt once across concurrent requests, and the application cookie cannot be centrally revoked. Production systems that require replay prevention, immediate logout, or cross-device revocation should use shared login-attempt and session storage. Add suitable CSRF protection, rate limits, key rotation, and authorization audit logging.
