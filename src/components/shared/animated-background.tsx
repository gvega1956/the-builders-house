'use client';

export function AnimatedBackground() {
  return (
    <>
      {/* Base — azul ejecutivo claro */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(145deg, #EBF3FF 0%, #D6E8FA 35%, #E4EFFE 65%, #F0F6FF 100%)',
        }}
      />

      {/* ── BLOB 1 — naranja marca muy sutil, arriba derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 600,
          height: 600,
          top: -200,
          right: -150,
          background: 'radial-gradient(circle at 40% 40%, rgba(236,99,38,0.08) 0%, rgba(244,124,68,0.04) 50%, transparent 72%)',
          filter: 'blur(60px)',
          animation: 'blob1 18s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 2 — azul suave, abajo izquierda ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 700,
          height: 700,
          bottom: -250,
          left: -200,
          background: 'radial-gradient(circle at 55% 55%, rgba(59,130,246,0.12) 0%, rgba(37,99,235,0.06) 50%, transparent 72%)',
          filter: 'blur(64px)',
          animation: 'blob2 22s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 3 — azul cielo, centro ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 500,
          height: 500,
          top: '30%',
          left: '20%',
          background: 'radial-gradient(circle at 50% 50%, rgba(147,197,253,0.20) 0%, rgba(96,165,250,0.10) 55%, transparent 72%)',
          filter: 'blur(48px)',
          animation: 'blob3 14s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 4 — blanco-azul, arriba centro ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 440,
          height: 440,
          top: -60,
          left: '38%',
          background: 'radial-gradient(circle at 50% 50%, rgba(219,234,254,0.55) 0%, rgba(191,219,254,0.28) 55%, transparent 72%)',
          filter: 'blur(50px)',
          animation: 'blob4 24s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 5 — índigo muy sutil, abajo derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 480,
          height: 480,
          bottom: -100,
          right: '8%',
          background: 'radial-gradient(circle at 45% 45%, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.04) 55%, transparent 70%)',
          filter: 'blur(52px)',
          animation: 'blob5 20s ease-in-out infinite',
        }}
      />

      <style>{`
        @keyframes blob1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(-30px, 25px) scale(1.06); }
          66%      { transform: translate(20px,-15px) scale(0.95); }
        }
        @keyframes blob2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(40px,-30px) scale(1.05); }
          66%      { transform: translate(-20px, 20px) scale(0.96); }
        }
        @keyframes blob3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(25px, 30px) scale(1.08); }
        }
        @keyframes blob4 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(28px, 18px) scale(1.04); }
          80%      { transform: translate(-15px,-12px) scale(0.97); }
        }
        @keyframes blob5 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(-22px,-18px) scale(1.05); }
          66%      { transform: translate(15px, 14px) scale(0.97); }
        }
      `}</style>
    </>
  );
}
