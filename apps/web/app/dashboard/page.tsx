import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { open } from '../../lib/auth/crypto';
import type { Session } from '../../lib/auth/types';
import {
  actors,
  authorize,
  authorizeStatusChange,
  orders,
} from '../../lib/auth/authorization';

export default async function Dashboard() {
  const session = open<Session>(
    (await cookies()).get('app_session')?.value,
    'app-session',
  );
  if (!session || session.expiresAt < Date.now()) redirect('/');
  const actor = actors[session.sub];
  if (!actor) redirect('/');
  const examples = [
    {
      label: 'Read order 900 (Store 42)',
      method: 'GET',
      path: '/api/orders/900',
      decision: authorize(actor, 'order.read', orders['900']!),
    },
    {
      label: 'Read order 903 (another tenant)',
      method: 'GET',
      path: '/api/orders/903',
      decision: authorize(actor, 'order.read', orders['903']!),
    },
    {
      label: 'Update order 900 to READY',
      method: 'PATCH',
      path: '/api/orders/900',
      body: { status: 'READY' },
      decision: authorizeStatusChange(actor, orders['900']!, 'READY'),
    },
    {
      label: 'Refund paid order 901 (300)',
      method: 'POST',
      path: '/api/orders/901/refund',
      decision: authorize(actor, 'order.refund', orders['901']!),
    },
    {
      label: 'Refund paid order 902 (800)',
      method: 'POST',
      path: '/api/orders/902/refund',
      decision: authorize(actor, 'order.refund', orders['902']!),
    },
  ];
  return (
    <main className="mx-auto max-w-2xl p-10">
      <p className="mb-4 text-sm tracking-widest text-blue-600 uppercase">
        Protected app page
      </p>
      <h1 className="mb-4 text-3xl font-bold">Welcome, {session.name}</h1>
      <p className="mb-6">
        The mock provider proved identity. This page reads only your app&apos;s
        encrypted HttpOnly session cookie.
      </p>
      <div className="rounded-xl border p-5">
        <p>
          <strong>Application user:</strong> {session.sub}
        </p>
        <p>
          <strong>Session expires:</strong>{' '}
          {new Date(session.expiresAt).toLocaleString()}
        </p>
        <p>
          <strong>Application role:</strong> {actor.role}
        </p>
        <p>
          <strong>Assigned stores:</strong>{' '}
          {actor.storeIds.join(', ') || 'none'}
        </p>
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-bold">Conditional permission examples</h2>
        <p className="mt-2 text-sm text-slate-600">
          These are previewed decisions. The API independently checks each
          request. PATCH and refund return a simulated result without changing
          an order or transferring money.
        </p>
        <ul className="mt-4 space-y-3">
          {examples.map((example) => (
            <li key={example.label} className="rounded-lg border p-4">
              <strong>{example.label}</strong>{' '}
              <span
                className={
                  example.decision.allowed ? 'text-green-700' : 'text-red-700'
                }
              >
                {example.decision.allowed
                  ? 'ALLOW'
                  : `DENY: ${example.decision.reason}`}
              </span>
              <code className="mt-1 block text-xs">
                {example.method} {example.path}
                {example.body ? ` ${JSON.stringify(example.body)}` : ''}
              </code>
            </li>
          ))}
        </ul>
      </section>
      <form action="/auth/logout" method="post" className="mt-6">
        <button className="rounded-lg bg-slate-900 px-5 py-3 text-white">
          Log out
        </button>
      </form>
    </main>
  );
}
