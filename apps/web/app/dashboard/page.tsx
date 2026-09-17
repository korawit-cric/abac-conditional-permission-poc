import { ordersApi } from '@repo/api-client';
import { redirect } from 'next/navigation';
import { serverFetch } from '../../lib/fetch/server';

export default async function Dashboard() {
  const apiUrl =
    process.env.API_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API ||
    'http://localhost:3001';
  const summary = await serverFetch(ordersApi.accessSummary()).catch(
    () => null,
  );
  if (!summary) redirect('/');

  return (
    <main className="mx-auto max-w-2xl p-10">
      <p className="mb-4 text-sm tracking-widest text-blue-600 uppercase">
        NestJS + PostgreSQL protected page
      </p>
      <h1 className="mb-4 text-3xl font-bold">Welcome, {summary.actor.name}</h1>
      <p className="mb-6">
        NestJS validated the application cookie, loaded the actor and
        permissions through Prisma, and evaluated each example with
        database-scoped queries.
      </p>
      <div className="rounded-xl border p-5">
        <p>
          <strong>Application role:</strong> {summary.actor.role}
        </p>
        <p>
          <strong>Tenant:</strong> {summary.actor.tenantId}
        </p>
        <p>
          <strong>Assigned stores:</strong>{' '}
          {summary.actor.storeIds.join(', ') || 'none'}
        </p>
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Conditional permission examples</h2>
        <p className="mt-2 text-sm text-slate-600">
          These decisions come from the NestJS API. Actual order endpoints apply
          the same tenant, ownership, store, status, and amount conditions in
          Prisma queries.
        </p>
        <ul className="mt-4 space-y-3">
          {summary.examples.map((example) => (
            <li key={example.label} className="rounded-lg border p-4">
              <strong>{example.label}</strong>{' '}
              <span
                className={example.allowed ? 'text-green-700' : 'text-red-700'}
              >
                {example.allowed ? 'ALLOW' : `DENY: ${example.reason}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-6 flex flex-wrap gap-3">
        <form action={`${apiUrl}/auth/logout`} method="post">
          <button className="rounded-lg bg-slate-900 px-5 py-3 text-white">
            Log out this session
          </button>
        </form>
        <form action={`${apiUrl}/auth/logout-all`} method="post">
          <button className="rounded-lg border border-red-600 px-5 py-3 text-red-700">
            Log out all devices
          </button>
        </form>
      </div>
    </main>
  );
}
