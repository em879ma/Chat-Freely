import { useCallback, useEffect, useRef, useState } from 'react';

interface Particle {
  id: number;
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  scale: number;
  rotation: number;
  rotSpeed: number;
}

let nextId = 0;

export function EmojiBlast(props: {
  activeEmoji: string | null;
  onDone: () => void;
}) {
  const { activeEmoji, onDone } = props;
  const layerRef = useRef<HTMLDivElement>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const rafRef = useRef(0);

  const spawn = useCallback(
    (x: number, y: number) => {
      if (!activeEmoji) return;
      const count = 18 + Math.floor(Math.random() * 8);
      const batch: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 120 + Math.random() * 220;
        batch.push({
          id: nextId++,
          emoji: activeEmoji,
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          opacity: 1,
          scale: 0.6 + Math.random() * 0.8,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 600,
        });
      }
      setParticles((prev) => [...prev, ...batch]);
      onDone();
    },
    [activeEmoji, onDone],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      spawn(e.clientX - rect.left, e.clientY - rect.top);
    },
    [spawn],
  );

  useEffect(() => {
    if (particles.length === 0) return;

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      setParticles((prev) => {
        const next = prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx * dt,
            y: p.y + p.vy * dt,
            vy: p.vy + 420 * dt,
            vx: p.vx * 0.97,
            opacity: p.opacity - dt * 0.9,
            rotation: p.rotation + p.rotSpeed * dt,
          }))
          .filter((p) => p.opacity > 0);
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [particles.length > 0]);

  return (
    <div
      ref={layerRef}
      className={`emoji-blast-layer${activeEmoji ? ' placing' : ''}`}
      onClick={activeEmoji ? handleClick : undefined}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="emoji-particle"
          style={{
            left: p.x,
            top: p.y,
            opacity: p.opacity,
            transform: `translate(-50%,-50%) scale(${p.scale}) rotate(${p.rotation}deg)`,
          }}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
