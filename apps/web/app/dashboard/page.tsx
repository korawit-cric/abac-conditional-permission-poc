import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { open } from '../../lib/auth/crypto';
import type { Session } from '../../lib/auth/types';

export default async function Dashboard() {
  const session = open<Session>(
    (await cookies()).get('app_session')?.value,
    'app-session',
  );
  if (!session || session.expiresAt < Date.now()) redirect('/');
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
      </div>
      <form action="/auth/logout" method="post" className="mt-6">
        <button className="rounded-lg bg-slate-900 px-5 py-3 text-white">
          Log out
        </button>
      </form>
    </main>
  );
}
