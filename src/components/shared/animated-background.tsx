'use client';

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      {/* Base gradient — azul cielo muy suave */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #EEF4FF 0%, #F0F7FF 30%, #FEF6EE 70%, #FFF8F0 100%)',
        }}
      />

      {/* Blob 1 — naranja suave, arriba derecha */}
      <div
        className="blob absolute rounded-full"
        style={{
          width: 520,
          height: 520,
          top: '-120px',
          right: '-80px',
          background:
            'radial-gradient(circle, rgba(236,99,38,0.18) 0%, rgba(244,124,68,0.08) 60%, transparent 80%)',
          animation: 'float1 18s ease-in-out infinite',
        }}
      />

      {/* Blob 2 — navy suave, abajo izquierda */}
      <div
        className="blob absolute rounded-full"
        style={{
          width: 600,
          height: 600,
          bottom: '-160px',
          left: '-100px',
          background:
            'radial-gradient(circle, rgba(42,63,102,0.12) 0%, rgba(26,45,79,0.06) 60%, transparent 80%)',
          animation: 'float2 22s ease-in-out infinite',
        }}
      />

      {/* Blob 3 — naranja claro, centro */}
      <div
        className="blob absolute rounded-full"
        style={{
          width: 380,
          height: 380,
          top: '35%',
          left: '40%',
          background:
            'radial-gradient(circle, rgba(253,228,212,0.55) 0%, rgba(254,243,236,0.25) 60%, transparent 80%)',
          animation: 'float3 14s ease-in-out infinite',
        }}
      />

      {/* Blob 4 — azul muy suave, centro derecha */}
      <div
        className="blob absolute rounded-full"
        style={{
          width: 300,
          height: 300,
          top: '20%',
          right: '20%',
          background:
            'radial-gradient(circle, rgba(61,85,128,0.09) 0%, transparent 70%)',
          animation: 'float4 25s ease-in-out infinite',
        }}
      />

      {/* Blob 5 — naranja muy suave, abajo derecha */}
      <div
        className="blob absolute rounded-full"
        style={{
          width: 420,
          height: 420,
          bottom: '5%',
          right: '10%',
          background:
            'radial-gradient(circle, rgba(236,99,38,0.10) 0%, rgba(244,124,68,0.04) 60%, transparent 80%)',
          animation: 'float5 20s ease-in-out infinite',
        }}
      />

      {/* Blob 6 — pequeño acento navy, arriba centro */}
      <div
        className="blob absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          top: '8%',
          left: '35%',
          background:
            'radial-gradient(circle, rgba(15,31,58,0.07) 0%, transparent 70%)',
          animation: 'float6 16s ease-in-out infinite',
        }}
      />

      <style>{`
        @keyframes float1 {
          0%   { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(-30px, 25px) scale(1.05); }
          66%  { transform: translate(20px, -20px) scale(0.97); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float2 {
          0%   { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(40px, -30px) scale(1.04); }
          66%  { transform: translate(-25px, 20px) scale(0.96); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float3 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(-20px, 30px) scale(1.06); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float4 {
          0%   { transform: translate(0px, 0px) scale(1); }
          40%  { transform: translate(25px, 20px) scale(1.03); }
          80%  { transform: translate(-15px, -10px) scale(0.98); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float5 {
          0%   { transform: translate(0px, 0px) scale(1); }
          33%  { transform: translate(-35px, -20px) scale(1.05); }
          66%  { transform: translate(20px, 15px) scale(0.97); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        @keyframes float6 {
          0%   { transform: translate(0px, 0px) scale(1); }
          50%  { transform: translate(30px, -15px) scale(1.08); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
      `}</style>
    </div>
  );
}
