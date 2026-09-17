import Link from 'next/link';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const apiUrl =
    process.env.API_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API ||
    'http://localhost:3001';
  return (
    <main className="mx-auto max-w-3xl p-10">
      <p className="mb-4 text-sm tracking-widest text-blue-600 uppercase">
        Turborepo authentication demo
      </p>
      <h1 className="mb-4 text-4xl font-bold">
        External OAuth, revocable application session
      </h1>
      <p className="mb-6 text-lg">
        Walk through an authorization-code redirect with state and PKCE, then
        see how the API creates a revocable PostgreSQL-backed session.
      </p>
      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
          Login failed: invalid, expired, or mismatched callback.
        </p>
      )}
      <Link
        href={`${apiUrl}/auth/login`}
        className="inline-block rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white"
      >
        Start mock ThaiD login
      </Link>
      <section className="mt-6">
        <h2 className="font-bold">Try an application identity</h2>
        <div className="mt-2 flex flex-wrap gap-3 text-sm text-blue-700">
          {[
            ['Customer', 'mock-customer'],
            ['Store 10 staff', 'mock-staff-10'],
            ['Store 10 manager', 'mock-manager-10'],
            ['Store 42 manager', 'mock-manager-42'],
            ['HQ admin', 'mock-hq'],
          ].map(([label, persona]) => (
            <Link
              key={persona}
              href={`${apiUrl}/auth/login?persona=${persona}`}
              className="underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="mb-2 font-bold">External provider</h2>
          <p>
            Local mock accepts the PKCE challenge and returns an authorization
            code. It is a teaching stand-in, not ThaiD.
          </p>
        </section>
        <section className="rounded-xl border p-5">
          <h2 className="mb-2 font-bold">Your application</h2>
          <p>
            Server verifies state, exchanges the code with the verifier, maps
            identity, and issues a separate HttpOnly session.
          </p>
        </section>
      </div>
      <ol className="mt-10 list-inside list-decimal space-y-2 text-sm text-slate-600">
        <li>Login creates a 5-minute encrypted state + verifier cookie.</li>
        <li>Browser redirects through the mock authorization server.</li>
        <li>Callback validates state and exchanges code using PKCE.</li>
        <li>
          API stores a hashed session token in PostgreSQL and protects the
          dashboard.
        </li>
      </ol>
    </main>
  );
}
