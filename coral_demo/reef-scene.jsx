// reef-scene.jsx — coral reef photogrammetry explainer (continuous composition).
const { useComposition, Shot, Captions, Easing, interpolate, animate, clamp,
        CompositionStage, useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakColor } = window;

const W = 1920, H = 1080;
const C = {
  deep: '#02101c', water: '#083048', mid: '#0e4260',
  foam: '#f2f9ff', dim: '#8fb6d2',
  accent: '#2f8fd0', teal: '#1f8f84', amber: '#f59f00',
};
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const SANS = 'Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif';

const RES = (typeof window !== 'undefined' && window.__resources) || {};
const ORTHO = RES.ortho || 'ortho.png';
const IMGBASE = 'https://storage.googleapis.com/nmfs_odp_pifsc/PIFSC/ESD/ARP/pifsc-ai-data-repository/sfm/osi_demo/AGR-455/bundle_v2/colmap/images/';
const PHOTOS = ['IMG_6051_0.jpg', 'IMG_6052_1.jpg', 'IMG_6053_2.jpg', 'IMG_6054_3.jpg',
  'IMG_6055_4.jpg', 'IMG_6061_10.jpg', 'IMG_6071_20.jpg', 'IMG_6081_30.jpg']
  .map((f, i) => RES['photo' + i] ||
    (typeof window !== 'undefined' && window.OM_OFFLINE_IMAGES ? ORTHO : IMGBASE + f));

 // real 2025_AGR-455 orthomosaic crop (COG capture)

// deterministic pseudo-random
const rnd = (i, s = 0) => {
  const x = Math.sin((i + 1) * 127.1 + s * 311.7 + (i + 1) * (i + 1) * 0.0173) * 43758.5453;
  return x - Math.floor(x);
};
// synthetic reef relief, u,v in 0..1 -> 0..1
const relief = (u, v) =>
  0.5 + 0.28 * Math.sin(u * 6.1 + 0.6) * Math.cos(v * 4.3) +
  0.13 * Math.sin(u * 13.7 + v * 9.1) + 0.08 * Math.cos(u * 21.3 - v * 17.7);

const RAMP = [[0.0, [9, 42, 74]], [0.35, [22, 110, 120]], [0.6, [31, 143, 132]],
  [0.82, [232, 176, 44]], [1.0, [246, 249, 255]]];
function rampColor(t) {
  t = clamp(t, 0, 1);
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [a, ca] = RAMP[i], [b, cb] = RAMP[i + 1];
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(',')})`;
    }
  }
  return '#fff';
}

const MOTION = {
  enter: (start, dur = 0.9, from = 0, to = 1) => animate({ from, to, start, end: start + dur, ease: Easing.easeOutCubic }),
  draw: (start, end, from = 0, to = 1) => animate({ from, to, start, end, ease: Easing.easeInOutQuad }),
  pop: (start, dur = 0.5, from = 0, to = 1) => animate({ from, to, start, end: start + dur, ease: Easing.easeOutBack }),
};

// ── shared atoms ─────────────────────────────────────────────────────────────
function Label({ x, y, text, sub, o = 1, align = 'left', accent = C.amber, show = true }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, opacity: o, textAlign: align,
      transform: align === 'center' ? 'translateX(-50%)' : 'none',
    }}>
      <div style={{
        font: `600 26px ${MONO}`, letterSpacing: '0.18em', color: accent,
        textTransform: 'uppercase', textShadow: '0 2px 16px rgba(0,0,0,.6)',
      }}>{text}</div>
      {sub && <div style={{
        marginTop: 8, font: `400 26px ${SANS}`, color: C.dim, letterSpacing: '0.02em',
        textShadow: '0 2px 14px rgba(0,0,0,.6)',
      }}>{sub}</div>}
    </div>
  );
}

function Ocean({ T }) {
  const rays = [0, 1, 2, 3].map(i => {
    const drift = Math.sin(T * 0.19 + i * 1.7) * 90;
    return (
      <div key={i} style={{
        position: 'absolute', top: -300, left: 180 + i * 430 + drift, width: 190, height: 1900,
        background: `linear-gradient(180deg, rgba(190,232,255,${0.09 + 0.04 * Math.sin(T * 0.5 + i)}), rgba(190,232,255,0))`,
        transform: 'rotate(13deg)', filter: 'blur(14px)',
      }} />
    );
  });
  const motes = [];
  for (let i = 0; i < 46; i++) {
    const sp = 8 + rnd(i, 3) * 22;
    const y = (H + 60) - ((T * sp + rnd(i, 1) * 1400) % (H + 200));
    const sz = 2 + rnd(i, 2) * 5;
    motes.push(<div key={i} style={{
      position: 'absolute', left: rnd(i, 4) * W, top: y, width: sz, height: sz,
      borderRadius: '50%', background: 'rgba(226,244,255,0.5)',
      opacity: 0.15 + 0.5 * rnd(i, 5), filter: 'blur(0.6px)',
    }} />);
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      background: `radial-gradient(120% 90% at 50% -10%, ${C.mid} 0%, ${C.water} 42%, ${C.deep} 100%)`,
    }}>{rays}{motes}</div>
  );
}

// tilted plan-view container (the "reef plate")
function Plate({ T, tilt, scale, ty, children, o = 1 }) {
  return (
    <div style={{
      position: 'absolute', left: (W - 1240) / 2, top: 220, width: 1240, height: 700,
      transform: `perspective(1500px) translateY(${ty}px) scale(${scale}) rotateX(${tilt}deg)`,
      transformStyle: 'preserve-3d', opacity: o,
    }}>{children}</div>
  );
}

// ── 1. descent ───────────────────────────────────────────────────────────────
function Descent({ T, CUES, labels }) {
  const s = MOTION.draw(0, 6.4, 1.22, 1.04)(T);
  const dark = interpolate([0, 1.6, 4.2, 5.2], [0.9, 0.42, 0.42, 0.92])(T);
  const tIn = MOTION.enter(1.0, 1.1)(T) * (1 - MOTION.draw(4.0, 4.9)(T));
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img src={PHOTOS[0]} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${s}) translateY(${(s - 1) * -120}px)`,
      }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(2,16,28,${dark * 0.8}), rgba(2,16,28,${dark}))` }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 400, textAlign: 'center',
        opacity: tIn, transform: `translateY(${(1 - tIn) * 26}px)`,
      }}>
        <div style={{
          font: `700 92px ${SANS}`, letterSpacing: '0.14em', color: C.foam,
          textTransform: 'uppercase', textShadow: '0 6px 40px rgba(0,0,0,.6)',
        }}>Reef Photogrammetry</div>
        <div style={{ marginTop: 26, font: `400 34px ${SANS}`, color: '#bfdcf0', letterSpacing: '0.06em' }}>
          one dive · thousands of photos · a measurable reef
        </div>
      </div>
      <Label show={labels} x={90} y={950} o={MOTION.enter(2.4, 0.8)(T)}
        text="site AGR-455" sub="depth 8.4 m · StRS survey" accent={C.amber} />
    </div>
  );
}

// ── 2. transect ──────────────────────────────────────────────────────────────
const PATH = [[70, 620], [1170, 600], [1170, 470], [70, 450], [70, 320], [1170, 300], [1170, 170], [70, 150]];
function pathPoint(p) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const d = Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]);
    segs.push(d); total += d;
  }
  let want = clamp(p, 0, 1) * total;
  for (let i = 0; i < segs.length; i++) {
    if (want <= segs[i]) {
      const k = segs[i] === 0 ? 0 : want / segs[i];
      return [PATH[i][0] + (PATH[i + 1][0] - PATH[i][0]) * k,
        PATH[i][1] + (PATH[i + 1][1] - PATH[i][1]) * k];
    }
    want -= segs[i];
  }
  return PATH[PATH.length - 1];
}

function Transect({ T, CUES, labels }) {
  const c = CUES.Transect;
  const app = MOTION.enter(c - 0.5, 1.2)(T);
  const p = MOTION.draw(c + 0.5, c + 6.0)(T);
  const [dx, dy] = pathPoint(p);
  const shots = [];
  const N = 26;
  for (let i = 0; i < N; i++) {
    const at = c + 0.6 + (i / N) * 5.4;
    const life = clamp((T - at) / 0.5, 0, 1);
    if (life <= 0) continue;
    const [px, py] = pathPoint(i / (N - 1));
    shots.push(
      <g key={i} opacity={0.25 + 0.55 * life}>
        <rect x={px - 62} y={py - 42} width={124} height={84} rx={4}
          fill={`rgba(245,159,0,${0.06 + 0.05 * life})`} stroke={C.amber}
          strokeWidth={2} opacity={life} />
        <circle cx={px} cy={py} r={6 + (1 - life) * 26} fill="none"
          stroke="#fff6df" strokeWidth={2} opacity={(1 - life) * 0.9} />
      </g>
    );
  }
  const count = Math.round(p * 1480);
  const plateScale = animate({ from: 0.92, to: 1.0, start: c - 0.5, end: c + 2.2, ease: Easing.easeOutCubic })(T);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Plate T={T} tilt={58} scale={plateScale} ty={0} o={app}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 6, overflow: 'hidden',
          boxShadow: '0 60px 120px rgba(0,0,0,.55)',
        }}>
          <img src={PHOTOS[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.9) brightness(0.78)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,22,38,.35), rgba(4,22,38,.7))' }} />
        </div>
        <svg width={1240} height={700} viewBox="0 0 1240 700" style={{ position: 'absolute', inset: 0 }}>
          <polyline points={PATH.map(pt => pt.join(',')).join(' ')} fill="none"
            stroke="rgba(207,236,255,.28)" strokeWidth={3} strokeDasharray="10 10" />
          <polyline points={PATH.map(pt => pt.join(',')).join(' ')} fill="none"
            stroke={C.foam} strokeWidth={4} pathLength={1}
            strokeDasharray={1} strokeDashoffset={1 - p} strokeLinecap="round" />
          {shots}
          <g opacity={app}>
            <circle cx={dx} cy={dy} r={22} fill="rgba(47,143,208,.35)" stroke={C.foam} strokeWidth={3} />
            <circle cx={dx} cy={dy} r={7} fill={C.foam} />
          </g>
        </svg>
      </Plate>
      <Label show={labels} x={120} y={140} o={MOTION.enter(c + 0.3, 0.8)(T)}
        text="1 · collect" sub="diver swims a gridded transect" />
      <div style={{
        position: 'absolute', right: 120, top: 150, textAlign: 'right',
        opacity: MOTION.enter(c + 0.9, 0.8)(T),
      }}>
        <div style={{ font: `600 76px ${MONO}`, color: C.foam, letterSpacing: '0.02em' }}>{count}</div>
        <div style={{ font: `500 24px ${MONO}`, color: C.dim, letterSpacing: '0.2em', textTransform: 'uppercase' }}>frames captured</div>
      </div>
    </div>
  );
}

// ── 3. overlap ───────────────────────────────────────────────────────────────
function Overlap({ T, CUES, labels }) {
  const c = CUES.Overlap;
  const quads = [0, 1, 2, 3].map(i => {
    const a = MOTION.enter(c + 0.4 + i * 0.55, 0.9)(T);
    return (
      <div key={i} style={{
        position: 'absolute', left: 180 + i * 300, top: 250 + i * 40, width: 620, height: 420,
        opacity: a * 0.94, transform: `translateY(${(1 - a) * -70}px) scale(${0.92 + a * 0.08})`,
        border: `3px solid ${i === 3 ? C.amber : 'rgba(207,236,255,.6)'}`, borderRadius: 4,
        overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)',
      }}>
        <img src={PHOTOS[i + 1]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{
          position: 'absolute', left: 10, bottom: 8, font: `500 20px ${MONO}`,
          color: '#dff0ff', background: 'rgba(4,22,38,.7)', padding: '3px 8px', borderRadius: 4,
        }}>frame {String(i + 1).padStart(4, '0')}</div>
      </div>
    );
  });
  const band = MOTION.enter(c + 2.6, 0.9)(T);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,16,28,.5)' }} />
      {quads}
      <div style={{
        position: 'absolute', left: 480, top: 250, width: 320, height: 540,
        background: `rgba(245,159,0,${0.16 * band})`, borderLeft: `2px dashed rgba(245,159,0,${band})`,
        borderRight: `2px dashed rgba(245,159,0,${band})`,
      }} />
      <Label show={labels} x={120} y={140} o={MOTION.enter(c + 0.2, 0.8)(T)}
        text="2 · overlap" sub="every point on the reef is seen from many angles" />
      <div style={{
        position: 'absolute', left: 640, top: 830, transform: 'translateX(-50%)',
        font: `600 34px ${MONO}`, color: C.amber, opacity: band, letterSpacing: '0.08em',
      }}>≈ 70% overlap</div>
    </div>
  );
}

// ── 4. alignment (SfM) ───────────────────────────────────────────────────────
function Alignment({ T, CUES, labels }) {
  const c = CUES.Alignment;
  const pairO = MOTION.enter(c + 0.2, 0.8)(T) * (1 - MOTION.draw(c + 4.6, c + 5.4)(T));
  const kp = MOTION.draw(c + 0.8, c + 2.4)(T);
  const mt = MOTION.draw(c + 2.0, c + 4.2)(T);
  const pts = [];
  for (let i = 0; i < 54; i++) pts.push([rnd(i, 11), rnd(i, 12)]);
  const dot = (x, y, i, side) => {
    const vis = rnd(i, 13) < kp * 1.15 ? 1 : 0;
    return <circle key={side + i} cx={x} cy={y} r={5} fill="none" stroke={C.amber} strokeWidth={2} opacity={vis * 0.9} />;
  };
  const FW = 620, FH = 420, L1 = 210, L2 = 1090, TOP = 300;
  const lines = pts.slice(0, 22).map((p, i) => {
    const on = clamp((mt - i / 30) * 4, 0, 1);
    const x1 = L1 + p[0] * FW, y1 = TOP + p[1] * FH;
    const x2 = L2 + (p[0] * 0.86 + 0.09) * FW, y2 = TOP + (p[1] * 0.9 + 0.04) * FH;
    return <line key={i} x1={x1} y1={y1} x2={x1 + (x2 - x1) * on} y2={y1 + (y2 - y1) * on}
      stroke="rgba(47,183,208,.75)" strokeWidth={1.6} />;
  });

  // camera poses arc
  const poseO = MOTION.enter(c + 5.0, 1.0)(T);
  const poses = [];
  for (let i = 0; i < 16; i++) {
    const on = clamp((MOTION.draw(c + 5.0, c + 7.4)(T) - i / 20) * 6, 0, 1);
    const x = 260 + i * 88, y = 330 + Math.sin(i * 0.7) * 26;
    poses.push(
      <g key={i} opacity={on}>
        <polygon points={`${x},${y} ${x - 26},${y - 20} ${x + 26},${y - 20}`} fill="rgba(47,143,208,.5)" stroke={C.foam} strokeWidth={2} />
        <line x1={x} y1={y} x2={x - 90} y2={760} stroke="rgba(245,159,0,.35)" strokeWidth={1.4} strokeDasharray="6 6" />
        <line x1={x} y1={y} x2={x + 90} y2={760} stroke="rgba(245,159,0,.35)" strokeWidth={1.4} strokeDasharray="6 6" />
      </g>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,16,28,.62)' }} />
      {[0, 1].map(s => (
        <div key={s} style={{
          position: 'absolute', left: s ? L2 : L1, top: TOP, width: FW, height: FH,
          opacity: pairO, border: '3px solid rgba(207,236,255,.5)', borderRadius: 4, overflow: 'hidden',
          transform: `translateY(${(1 - pairO) * 30}px)`,
        }}>
          <img src={PHOTOS[s ? 6 : 5]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(.85) brightness(.9)' }} />
        </div>
      ))}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, opacity: pairO }}>
        {pts.map((p, i) => dot(L1 + p[0] * FW, TOP + p[1] * FH, i, 'a'))}
        {pts.map((p, i) => dot(L2 + (p[0] * 0.86 + 0.09) * FW, TOP + (p[1] * 0.9 + 0.04) * FH, i, 'b'))}
        {lines}
      </svg>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, opacity: poseO }}>
        <line x1={140} y1={770} x2={1780} y2={770} stroke="rgba(207,236,255,.35)" strokeWidth={2} strokeDasharray="12 10" />
        {poses}
      </svg>
      <Label show={labels} x={120} y={140} o={MOTION.enter(c + 0.2, 0.8)(T)}
        text="3 · align" sub="structure-from-motion solves every camera position" />
      <div style={{
        position: 'absolute', left: 960, top: 860, transform: 'translateX(-50%)',
        font: `500 26px ${MONO}`, color: C.dim, letterSpacing: '0.14em',
        opacity: MOTION.enter(c + 2.4, 0.8)(T),
      }}>matched keypoints → bundle adjustment</div>
    </div>
  );
}

// ── 5. dense cloud + mesh ────────────────────────────────────────────────────
const GX = 40, GY = 24;
function Cloud({ T, CUES, labels }) {
  const c = CUES.Cloud;
  const grow = MOTION.draw(c + 0.4, c + 3.0)(T);
  const reveal = MOTION.draw(c + 0.2, c + 2.6)(T);
  const flat = MOTION.draw(CUES.Ortho - 0.9, CUES.Ortho + 0.4)(T); // heights collapse across the cue
  const hf = (1 - flat) * grow;
  const yaw = 0.18 * Math.sin((T - c) * 0.42);
  const proj = (u, v, h) => {
    const x = 960 + (u - 0.5) * 1300 + (v - 0.5) * 320 * yaw * 3;
    const y = 700 + (v - 0.5) * 380 - h * 250 * hf;
    return [x, y];
  };
  const pts = [], meshRows = [], meshCols = [];
  for (let j = 0; j < GY; j++) {
    const rowPts = [];
    for (let i = 0; i < GX; i++) {
      const u = i / (GX - 1), v = j / (GY - 1);
      const h = relief(u, v);
      const [x, y] = proj(u, v, h);
      rowPts.push([x, y]);
      const id = j * GX + i;
      if (rnd(id, 21) < reveal * 1.2) {
        const sz = 3 + h * 4;
        pts.push(<rect key={id} x={x - sz / 2} y={y - sz / 2} width={sz} height={sz} rx={1}
          fill={rampColor(h * 0.9)} opacity={0.55 + 0.45 * h} />);
      }
    }
    meshRows.push(rowPts);
  }
  for (let i = 0; i < GX; i++) meshCols.push(meshRows.map(r => r[i]));
  const meshO = MOTION.enter(c + 3.4, 1.2)(T) * (1 - flat) * 0.55;
  const poly = (rows, k, stroke) => rows.filter((_, i) => i % k === 0).map((r, i) => (
    <polyline key={i} points={r.map(p => p.join(',')).join(' ')} fill="none" stroke={stroke} strokeWidth={1.4} />
  ));
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,16,28,.72)' }} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <g opacity={meshO}>{poly(meshRows, 2, 'rgba(160,225,235,.55)')}{poly(meshCols, 3, 'rgba(160,225,235,.4)')}</g>
        {pts}
      </svg>
      <Label show={labels} x={120} y={140} o={MOTION.enter(c + 0.2, 0.8)(T)}
        text="4 · reconstruct" sub="a dense point cloud, then a 3D surface mesh" />
      <div style={{
        position: 'absolute', right: 120, top: 150, textAlign: 'right',
        font: `500 26px ${MONO}`, color: C.dim, letterSpacing: '0.12em',
        opacity: MOTION.enter(c + 1.2, 0.8)(T),
      }}>
        <div style={{ font: `600 60px ${MONO}`, color: C.foam }}>18.4 M</div>
        points
      </div>
    </div>
  );
}

// ── 6/7. orthomosaic + DEM (same rectangle) ──────────────────────────────────
function MapProducts({ T, CUES, labels }) {
  const c = CUES.Ortho, d = CUES.Dem, tz = CUES.Tiles;
  const rise = MOTION.draw(c - 0.6, c + 1.4)(T);
  const tilt = 58 * (1 - rise);
  const RW = 1240, RH = 660;
  const shrink = MOTION.draw(tz - 0.5, tz + 0.8, 1, 0.56)(T);
  const drift = 1 + 0.03 * Math.sin((T - c) * 0.5);
  const tiles = [];
  for (let i = 0; i < 8; i++) {
    const on = clamp((MOTION.draw(c + 0.3, c + 2.6)(T) - (i % 4) * 0.14 - Math.floor(i / 4) * 0.12) * 4, 0, 1);
    tiles.push(
      <div key={i} style={{
        position: 'absolute', left: (i % 4) * (RW / 4), top: Math.floor(i / 4) * (RH / 2),
        width: RW / 4 + 1, height: RH / 2 + 1,
        background: C.deep, opacity: 1 - on,
        borderRight: `1px solid rgba(207,236,255,${0.5 * (1 - on)})`,
      }} />
    );
  }
  // DEM cells over the same rect
  const demIn = MOTION.draw(d + 0.2, d + 3.4)(T);
  const cells = [];
  const DX = 44, DY = 22;
  for (let j = 0; j < DY; j++) {
    for (let i = 0; i < DX; i++) {
      const u = i / (DX - 1), v = j / (DY - 1);
      if (u > demIn * 1.1) continue;
      cells.push(<div key={j * DX + i} style={{
        position: 'absolute', left: (i / DX) * RW, top: (j / DY) * RH,
        width: RW / DX + 1, height: RH / DY + 1, background: rampColor(relief(u, v)),
      }} />);
    }
  }
  const demO = MOTION.enter(d - 0.2, 0.6)(T) * (1 - MOTION.draw(tz - 0.6, tz + 0.2)(T));
  // profile line
  const prof = [];
  for (let i = 0; i < 90; i++) {
    const u = i / 89;
    if (u > demIn * 1.1) break;
    prof.push([160 + u * 1600, 1010 - relief(u, 0.5) * 90]);
  }
  // tile pyramid tiers
  const tierO = MOTION.enter(tz + 0.2, 0.9)(T);
  const tiers = [0, 1, 2].map(k => {
    const on = clamp((MOTION.draw(tz + 0.3, tz + 2.4)(T) - k * 0.22) * 4, 0, 1);
    const n = [2, 4, 8][k], sc = [0.42, 0.52, 0.62][k];
    const cellsG = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      cellsG.push(<div key={i + '_' + j} style={{
        position: 'absolute', left: (i / n) * 100 + '%', top: (j / n) * 100 + '%',
        width: 100 / n + '%', height: 100 / n + '%',
        border: '1px solid rgba(207,236,255,.45)',
        background: (k === 2 && i === 5 && j === 3) ? 'rgba(245,159,0,.5)' : 'transparent',
      }} />);
    }
    return (
      <div key={k} style={{
        position: 'absolute', left: 1180, top: 250 + k * 250, width: 520 * sc + 180, height: (520 * sc + 180) * 0.55,
        opacity: on * tierO, transform: `perspective(1200px) rotateX(52deg) rotateZ(-6deg) translateY(${(1 - on) * 40}px)`,
      }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <img src={ORTHO} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85,
            transform: `scale(${1 + k * 0.9})`,
          }} />
          {cellsG}
        </div>
        <div style={{
          position: 'absolute', right: -110, top: '40%', font: `600 28px ${MONO}`, color: C.amber,
        }}>z{[14, 16, 18][k]}</div>
      </div>
    );
  });
  const rectLeft = (W - RW) / 2, rectTop = 240;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,16,28,.8)' }} />
      <div style={{
        position: 'absolute', left: rectLeft, top: rectTop, width: RW, height: RH,
        transform: `perspective(1500px) rotateX(${tilt}deg) scale(${shrink * drift}) translateX(${(shrink - 1) * 520}px)`,
        boxShadow: '0 40px 100px rgba(0,0,0,.55)', overflow: 'hidden',
        border: '2px solid rgba(207,236,255,.35)',
      }}>
        <img src={ORTHO} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        {tiles}
        <div style={{ position: 'absolute', inset: 0, opacity: demO }}>{cells}</div>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, opacity: demO }}>
        <polyline points={prof.map(p => p.join(',')).join(' ')} fill="none" stroke={C.amber} strokeWidth={3} />
      </svg>
      {tiers}
      <Shot from={c - 0.6} to={d - 0.2}>
        <Label show={labels} x={120} y={140} o={MOTION.enter(c + 0.2, 0.8)(T)}
          text="5 · orthomosaic" sub="every frame stitched into one true-scale reef map" />
        <div style={{
          position: 'absolute', right: 120, top: 152, textAlign: 'right', font: `500 26px ${MONO}`,
          color: C.dim, letterSpacing: '0.12em', opacity: MOTION.enter(c + 1.4, 0.8)(T),
        }}>GeoTIFF · 1 cm / pixel</div>
      </Shot>
      <Shot from={d - 0.2} to={tz - 0.2}>
        <Label show={labels} x={120} y={140} o={MOTION.enter(d + 0.1, 0.8)(T)}
          text="6 · elevation" sub="the same surface as a DEM — depth, relief, rugosity" />
        <div style={{
          position: 'absolute', right: 120, top: 152, textAlign: 'right', font: `500 26px ${MONO}`,
          color: C.dim, letterSpacing: '0.12em', opacity: MOTION.enter(d + 1.2, 0.8)(T),
        }}>DEM · metres above datum</div>
      </Shot>
      <Shot from={tz - 0.2} to={CUES.Annotate}>
        <Label show={labels} x={120} y={140} o={MOTION.enter(tz + 0.1, 0.8)(T)}
          text="7 · serve" sub="cloud-optimized GeoTIFF — stream any zoom, no download" />
      </Shot>
    </div>
  );
}

// ── 8. annotate ──────────────────────────────────────────────────────────────
const CAT = RES.cat || 'cat-annotation.png'; // real CAT Lite session: 39 line + colony annotations
function Annotate({ T, CUES, labels }) {
  const c = CUES.Annotate;
  const app = MOTION.pop(c + 0.1, 0.8)(T);
  const PW = 1600, PH = 818;                       // panel viewport (screenshot is 1999x1022)
  const Z = MOTION.draw(c + 0.4, c + 5.6, 1.0, 1.85)(T);   // slow push-in
  const fx = 0.40, fy = 0.34;                      // focus: the dense annotation cluster
  const tx = clamp(PW / 2 - fx * PW * Z, PW - PW * Z, 0), ty = clamp(PH / 2 - fy * PH * Z, PH - PH * Z, 0);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,16,28,.88)' }} />
      <div style={{
        position: 'absolute', left: (W - PW) / 2, top: 190, width: PW, height: PH,
        background: '#0b1c2c', borderRadius: 10, overflow: 'hidden',
        border: '1px solid rgba(207,236,255,.25)',
        boxShadow: '0 50px 130px rgba(0,0,0,.65)', opacity: clamp(app, 0, 1),
        transform: `scale(${0.95 + 0.05 * clamp(app, 0, 1)})`,
      }}>
        <img src={CAT} alt="" style={{
          position: 'absolute', left: 0, top: 0, width: PW, height: PH, display: 'block',
          transform: `translate(${tx}px, ${ty}px) scale(${Z})`, transformOrigin: '0 0',
        }} />
      </div>
      <Label show={labels} x={120} y={80} o={MOTION.enter(c + 0.3, 0.8)(T)}
        text="8 · measure" sub="colonies and transect lines annotated on the map — in the browser" />
      <div style={{
        position: 'absolute', right: 120, top: 92, textAlign: 'right', font: `500 26px ${MONO}`,
        color: C.dim, letterSpacing: '0.12em', opacity: MOTION.enter(c + 1.6, 0.8)(T),
      }}>39 annotations · site GUA-2838</div>
    </div>
  );
}

// ── 9. close ─────────────────────────────────────────────────────────────────
function Close({ T, CUES, labels, total }) {
  const c = CUES.Close;
  const cards = [
    { k: '3D MESH', v: 'model.obj', tint: C.teal },
    { k: 'ORTHOMOSAIC', v: 'mos_cog.tif', tint: C.accent },
    { k: 'ELEVATION', v: 'dem.tif', tint: C.amber },
  ];
  const fade = MOTION.draw(total - 0.9, total)(T);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img src={PHOTOS[7]} alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        transform: `scale(${MOTION.draw(c, c + 5, 1.12, 1.2)(T)})`, filter: 'brightness(.5) saturate(.8)',
      }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,16,28,.68)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 330, display: 'flex', justifyContent: 'center', gap: 44 }}>
        {cards.map((cd, i) => {
          const on = MOTION.pop(c + 0.3 + i * 0.22, 0.8)(T);
          return (
            <div key={cd.k} style={{
              width: 420, padding: '34px 32px', borderRadius: 14,
              background: 'rgba(246,251,255,.07)', border: `1px solid ${cd.tint}`,
              backdropFilter: 'blur(6px)', opacity: clamp(on, 0, 1),
              transform: `translateY(${(1 - clamp(on, 0, 1)) * 40}px)`,
            }}>
              <div style={{ font: `600 24px ${MONO}`, letterSpacing: '0.2em', color: cd.tint }}>{cd.k}</div>
              <div style={{ marginTop: 14, font: `600 40px ${SANS}`, color: C.foam }}>{cd.v}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 620, textAlign: 'center',
        opacity: MOTION.enter(c + 1.3, 0.9)(T),
      }}>
        <div style={{ font: `700 54px ${SANS}`, color: C.foam, letterSpacing: '0.04em' }}>
          One dive becomes a measurable reef.
        </div>
        <div style={{ marginTop: 20, font: `500 26px ${MONO}`, color: C.dim, letterSpacing: '0.16em' }}>
          NOAA PIFSC · ESD · Coral Annotation Tool
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: C.deep, opacity: fade }} />
    </div>
  );
}

// ── the piece ────────────────────────────────────────────────────────────────
function Piece({ labels, accent }) {
  const { T, CUES, authoredTotal } = useComposition();
  const total = authoredTotal;
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: SANS, color: C.foam }}>
      <Ocean T={T} />
      <Shot from={0} to={CUES.Transect}><Descent T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Transect - 0.6} to={CUES.Overlap}><Transect T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Overlap} to={CUES.Alignment}><Overlap T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Alignment} to={CUES.Cloud}><Alignment T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Cloud} to={CUES.Ortho}><Cloud T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Ortho - 0.6} to={CUES.Annotate}><MapProducts T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Annotate} to={CUES.Close}><Annotate T={T} CUES={CUES} labels={labels} /></Shot>
      <Shot from={CUES.Close} to={total + 1}><Close T={T} CUES={CUES} labels={labels} total={total} /></Shot>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 6,
        background: `linear-gradient(90deg, ${accent} ${(T / total) * 100}%, rgba(255,255,255,.08) ${(T / total) * 100}%)`,
      }} />
    </div>
  );
}

function ReefExplainer() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS || { motionEditor: true, labels: true, accent: C.amber });
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <CompositionStage width={W} height={H} bg={C.deep}
        scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <Piece labels={t.labels !== false} accent={t.accent || C.amber} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Video" />
        <TweakToggle label="Motion editor" value={t.motionEditor !== false} onChange={v => setTweak('motionEditor', v)} />
        <TweakToggle label="Step labels" value={t.labels !== false} onChange={v => setTweak('labels', v)} />
        <TweakSection label="Look" />
        <TweakColor label="Accent" value={t.accent || C.amber}
          options={[C.amber, C.teal, C.accent, '#e8734a']} onChange={v => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

window.ReefExplainer = ReefExplainer;
