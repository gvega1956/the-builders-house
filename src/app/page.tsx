import { redirect } from 'next/navigation';

// Root siempre redirige al dashboard (o login si no hay sesión)
export default function RootPage() {
  redirect('/dashboard');
}
