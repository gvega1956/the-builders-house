'use client';

export function AnimatedBackground() {
  return (
    <>
      {/* Base gradient pegada al layout, no fixed */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(145deg, #EDF2FF 0%, #F5F0FF 25%, #FFF0E8 60%, #FFF7F0 100%)',
        }}
      />

      {/* ── BLOB 1 — naranja fuerte, arriba derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 560,
          height: 560,
          top: -180,
          right: -120,
          background: 'radial-gradient(circle at 40% 40%, rgba(236,99,38,0.38) 0%, rgba(244,124,68,0.22) 40%, transparent 70%)',
          filter: 'blur(48px)',
          animation: 'blob1 16s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 2 — navy, abajo izquierda ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 640,
          height: 640,
          bottom: -200,
          left: -160,
          background: 'radial-gradient(circle at 55% 55%, rgba(26,45,79,0.28) 0%, rgba(42,63,102,0.16) 45%, transparent 70%)',
          filter: 'blur(56px)',
          animation: 'blob2 20s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 3 — naranja claro, centro izquierda ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 440,
          height: 440,
          top: '28%',
          left: '18%',
          background: 'radial-gradient(circle at 50% 50%, rgba(253,228,212,0.80) 0%, rgba(236,99,38,0.18) 50%, transparent 72%)',
          filter: 'blur(36px)',
          animation: 'blob3 13s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 4 — lila/azul, arriba centro ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 380,
          height: 380,
          top: -60,
          left: '38%',
          background: 'radial-gradient(circle at 50% 50%, rgba(168,148,255,0.22) 0%, rgba(139,120,240,0.12) 50%, transparent 72%)',
          filter: 'blur(40px)',
          animation: 'blob4 22s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 5 — naranja, abajo derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 480,
          height: 480,
          bottom: -100,
          right: '8%',
          background: 'radial-gradient(circle at 45% 45%, rgba(236,99,38,0.24) 0%, rgba(244,124,68,0.12) 50%, transparent 70%)',
          filter: 'blur(44px)',
          animation: 'blob5 18s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 6 — azul cielo, centro derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 300,
          height: 300,
          top: '42%',
          right: '22%',
          background: 'radial-gradient(circle at 50% 50%, rgba(56,132,255,0.16) 0%, rgba(96,165,250,0.08) 55%, transparent 72%)',
          filter: 'blur(32px)',
          animation: 'blob6 15s ease-in-out infinite',
        }}
      />

      <style>{`
        @keyframes blob1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(-40px, 35px) scale(1.08); }
          66%      { transform: translate(25px,-20px) scale(0.94); }
        }
        @keyframes blob2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(50px,-40px) scale(1.06); }
          66%      { transform: translate(-30px, 25px) scale(0.95); }
        }
        @keyframes blob3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(30px, 40px) scale(1.10); }
        }
        @keyframes blob4 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%      { transform: translate(35px, 25px) scale(1.05); }
          80%      { transform: translate(-20px,-15px) scale(0.96); }
        }
        @keyframes blob5 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%      { transform: translate(-30px,-25px) scale(1.07); }
          66%      { transform: translate(20px, 18px) scale(0.96); }
        }
        @keyframes blob6 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(-25px, 20px) scale(1.12); }
        }
      `}</style>
    </>
  );
}
