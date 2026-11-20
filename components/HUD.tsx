'use client';
import { useEffect, useState } from 'react';
import { useTour } from '@/lib/store';
import { STEPS } from '@/lib/tour';

const FLOOR_ROWS = [
  { floor: 5, label: 'Azotea' },
  { floor: 4, label: '4º piso' },
  { floor: 3, label: '3º piso' },
  { floor: 2, label: '2º piso' },
  { floor: 1, label: '1º piso' },
  { floor: 0, label: 'Planta baja' },
  { floor: -1, label: 'Exterior' },
];

const fmt = new Intl.NumberFormat('es-ES');

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  points: 'M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01',
  cut: 'M4 20V8l8-4 8 4v12M4 20h16M12 4v16',
  play: 'M7 5l12 7-12 7V5z',
  pause: 'M8 5v14M16 5v14',
  scan: 'M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M3 12h18',
};

export function HUD() {
  const step = useTour((s) => s.step);
  const moving = useTour((s) => s.moving);
  const scanning = useTour((s) => s.scanning);
  const scanProgress = useTour((s) => s.scanProgress);
  const pointCount = useTour((s) => s.pointCount);
  const showPoints = useTour((s) => s.showPoints);
  const cutaway = useTour((s) => s.cutaway);
  const autoplay = useTour((s) => s.autoplay);
  const ready = useTour((s) => s.ready);
  const { goTo, next, prev, togglePoints, toggleCutaway, toggleAutoplay, rescan } = useTour.getState();

  const s = STEPS[step];
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
      else if (e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // recorrido automático
  useEffect(() => {
    if (!autoplay || moving || scanning) return;
    const id = setTimeout(() => {
      const st = useTour.getState();
      if (st.step >= STEPS.length - 1) st.toggleAutoplay();
      else st.next();
    }, 4200);
    return () => clearTimeout(id);
  }, [autoplay, moving, scanning, step]);

  const goFloor = (floor: number) => {
    if (floor === -1) return goTo(1);
    const idx = STEPS.findIndex((st) => st.floor === floor);
    if (idx >= 0) goTo(idx);
  };

  const pct = Math.round(scanProgress * 100);
  const shownPoints = scanning ? Math.round(pointCount * scanProgress) : pointCount;

  return (
    <div className="hud">
      <header className="brand panel">
        <div className="logo" aria-hidden>
          <span />
        </div>
        <div>
          <div className="brand-title">Venus · Escáner 3D</div>
          <div className="brand-sub">Hotel abandonado · reconstrucción a partir de fotografías</div>
        </div>
      </header>

      <nav className="floors panel" aria-label="Niveles del edificio">
        <div className="floors-title">Niveles</div>
        {FLOOR_ROWS.map((r) => {
          const active = s.floor === r.floor || (r.floor === -1 && s.floor === -1);
          return (
            <button key={r.floor} className={`floor-row ${active ? 'active' : ''} ${r.floor === -1 ? 'ext' : ''}`} onClick={() => goFloor(r.floor)}>
              <span className="floor-bar" />
              <span>{r.label}</span>
            </button>
          );
        })}
      </nav>

      {scanning && ready && (
        <div className="scan-status panel" role="status">
          <div className="scan-row">
            <span className="pulse" />
            <span className="scan-label">Escaneando</span>
            <span className="scan-pct">{pct}%</span>
          </div>
          <div className="scan-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="scan-meta">{fmt.format(shownPoints)} puntos capturados</div>
        </div>
      )}

      <section className="step panel" aria-live="polite">
        <div className="step-head">
          <div>
            <div className="kicker">
              {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')} · {s.kicker}
            </div>
            <h1 className="step-title">{s.title}</h1>
          </div>
          <div className="nav-buttons">
            <button className="icon-btn" onClick={prev} disabled={step === 0} aria-label="Paso anterior">
              <Icon d={ICONS.prev} />
            </button>
            <button className={`icon-btn primary ${!moving && !scanning && step < STEPS.length - 1 ? 'glow' : ''}`} onClick={next} disabled={step === STEPS.length - 1} aria-label="Paso siguiente">
              <Icon d={ICONS.next} />
            </button>
          </div>
        </div>
        <p className={`step-text ${expanded ? 'open' : ''}`}>{s.text}</p>
        <button className="more-btn" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
        <ol className="timeline">
          {STEPS.map((st, i) => (
            <li key={st.id}>
              <button className={`dot ${i === step ? 'current' : ''} ${i < step ? 'past' : ''}`} onClick={() => goTo(i)} title={st.title} aria-label={st.title}>
                <span className="dot-label">{st.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <div className="tools panel">
        <button className={`tool ${showPoints ? 'on' : ''}`} onClick={togglePoints} title="Ver solo la nube de puntos">
          <Icon d={ICONS.points} />
          <span>Nube de puntos</span>
        </button>
        <button className={`tool ${cutaway ? 'on' : ''}`} onClick={toggleCutaway} title="Quitar la fachada para ver los pisos">
          <Icon d={ICONS.cut} />
          <span>Vista de corte</span>
        </button>
        <button className={`tool ${autoplay ? 'on' : ''}`} onClick={toggleAutoplay} title="Recorrido automático">
          <Icon d={autoplay ? ICONS.pause : ICONS.play} />
          <span>{autoplay ? 'Pausar' : 'Recorrido'}</span>
        </button>
        <button className="tool" onClick={rescan} title="Repetir el escaneo">
          <Icon d={ICONS.scan} />
          <span>Re-escanear</span>
        </button>
      </div>

      <div className="hint">
        <span className="hint-mouse">
          {s.mode === 'orbit' ? 'Arrastra para orbitar · rueda para acercar' : 'Arrastra para mirar alrededor'} · ← → para avanzar
        </span>
        <span className="hint-touch">{s.mode === 'orbit' ? 'Desliza para girar · pellizca para acercar' : 'Desliza para mirar alrededor'}</span>
      </div>
    </div>
  );
}
