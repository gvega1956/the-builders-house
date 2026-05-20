'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { brand } from '@/lib/brand';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError('Email o contraseña incorrectos');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  }

  const inputClass =
    'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white text-slate-900 placeholder:text-slate-400';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@buildershouse.pr"
          required
          className={inputClass}
          style={{ '--tw-ring-color': brand.orange[500] + '40' } as React.CSSProperties}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1.5">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className={inputClass}
          style={{ '--tw-ring-color': brand.orange[500] + '40' } as React.CSSProperties}
        />
      </div>

      {error && (
        <div className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-70"
        style={{ backgroundColor: loading ? brand.orange[400] : brand.orange[500] }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = brand.orange[600]; }}
        onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = brand.orange[500]; }}
      >
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  );
}
