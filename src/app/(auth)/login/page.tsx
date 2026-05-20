import { Logo } from '@/components/brand/logo';
import { brand } from '@/lib/brand';
import { LoginForm } from './login-form';

export const metadata = { title: 'Iniciar sesión — The Builder\'s House' };

export default function LoginPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: `linear-gradient(135deg, ${brand.navy[950]} 0%, ${brand.navy[800]} 100%)` }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size="lg" variant="full" theme="dark" />
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">Iniciar sesión</h1>
          <p className="text-sm text-slate-500 mb-6">Ingresa con tus credenciales de acceso</p>
          <LoginForm />
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          The Builder&apos;s House · Puerto Rico · ERP v1.0
        </p>
      </div>
    </div>
  );
}
