'use client';

export function AnimatedBackground() {
  return (
    <>
      {/* Base — azul medio royal (no negro) */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: 'linear-gradient(145deg, #0D2B52 0%, #1A4080 30%, #1E4D96 65%, #0D2B52 100%)',
        }}
      />

      {/* ── BLOB 1 — naranja marca, arriba derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 560,
          height: 560,
          top: -180,
          right: -120,
          background: 'radial-gradient(circle at 40% 40%, rgba(236,99,38,0.40) 0%, rgba(244,124,68,0.20) 40%, transparent 70%)',
          filter: 'blur(48px)',
          animation: 'blob1 16s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 2 — azul royal, abajo izquierda ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 680,
          height: 680,
          bottom: -220,
          left: -180,
          background: 'radial-gradient(circle at 55% 55%, rgba(30,80,160,0.70) 0%, rgba(20,60,130,0.45) 45%, transparent 70%)',
          filter: 'blur(56px)',
          animation: 'blob2 20s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 3 — azul cielo vivo, centro izquierda ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 480,
          height: 480,
          top: '28%',
          left: '14%',
          background: 'radial-gradient(circle at 50% 50%, rgba(56,139,253,0.35) 0%, rgba(30,100,220,0.20) 50%, transparent 72%)',
          filter: 'blur(40px)',
          animation: 'blob3 13s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 4 — azul claro, arriba centro ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 420,
          height: 420,
          top: -80,
          left: '35%',
          background: 'radial-gradient(circle at 50% 50%, rgba(100,180,255,0.28) 0%, rgba(60,140,240,0.16) 55%, transparent 72%)',
          filter: 'blur(44px)',
          animation: 'blob4 22s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 5 — naranja sutil, abajo derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 460,
          height: 460,
          bottom: -80,
          right: '6%',
          background: 'radial-gradient(circle at 45% 45%, rgba(236,99,38,0.28) 0%, rgba(244,124,68,0.14) 55%, transparent 70%)',
          filter: 'blur(44px)',
          animation: 'blob5 18s ease-in-out infinite',
        }}
      />

      {/* ── BLOB 6 — azul índigo medio, centro derecha ── */}
      <div
        className="absolute -z-10 rounded-full"
        style={{
          width: 340,
          height: 340,
          top: '40%',
          right: '18%',
          background: 'radial-gradient(circle at 50% 50%, rgba(80,120,240,0.28) 0%, rgba(60,90,210,0.16) 55%, transparent 72%)',
          filter: 'blur(36px)',
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
