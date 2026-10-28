/* 星空マップ — 画面の制御と星図の描画 */
(function () {
  'use strict';

  const A = window.Astro;
  const $ = (id) => document.getElementById(id);

  // ---------- データの準備 ----------

  const SF = Object.fromEntries(window.STAR_DATA.fields.map((f, i) => [f, i]));
  const STARS = window.STAR_DATA.stars.map((r) => ({
    hr: r[SF.hr], ra: r[SF.ra], dec: r[SF.dec], mag: r[SF.mag], temp: r[SF.temp],
    bayer: r[SF.bayer], flam: r[SF.flam], con: r[SF.con], name: r[SF.name], ja: r[SF.ja],
  }));
  const CONS = window.CONSTELLATION_DATA.constellations;
  const CON_BY_ABBR = {};
  for (const c of CONS) if (!CON_BY_ABBR[c.abbr]) CON_BY_ABBR[c.abbr] = c;

  const CITIES = [
    { name: '東京', lat: 35.6895, lon: 139.6917, tz: 'Asia/Tokyo' },
    { name: '札幌', lat: 43.0618, lon: 141.3545, tz: 'Asia/Tokyo' },
    { name: '仙台', lat: 38.2682, lon: 140.8694, tz: 'Asia/Tokyo' },
    { name: '名古屋', lat: 35.1815, lon: 136.9066, tz: 'Asia/Tokyo' },
    { name: '大阪', lat: 34.6937, lon: 135.5023, tz: 'Asia/Tokyo' },
    { name: '広島', lat: 34.3853, lon: 132.4553, tz: 'Asia/Tokyo' },
    { name: '福岡', lat: 33.5904, lon: 130.4017, tz: 'Asia/Tokyo' },
    { name: '那覇', lat: 26.2124, lon: 127.6792, tz: 'Asia/Tokyo' },
    { name: '石垣島', lat: 24.3448, lon: 124.1572, tz: 'Asia/Tokyo' },
    { name: 'ソウル', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul' },
    { name: '台北', lat: 25.033, lon: 121.5654, tz: 'Asia/Taipei' },
    { name: 'シンガポール', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore' },
    { name: 'シドニー', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
    { name: 'ホノルル', lat: 21.3069, lon: -157.8583, tz: 'Pacific/Honolulu' },
    { name: 'ロサンゼルス', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles' },
    { name: 'ニューヨーク', lat: 40.7128, lon: -74.006, tz: 'America/New_York' },
    { name: 'ロンドン', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
    { name: 'パリ', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris' },
    { name: 'ケープタウン', lat: -33.9249, lon: 18.4241, tz: 'Africa/Johannesburg' },
    { name: 'アタカマ（チリ）', lat: -24.6272, lon: -70.4044, tz: 'America/Santiago' },
  ];

  const browserTz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
  })();

  // ---------- 状態 ----------

  const state = {
    lat: 35.6895, lon: 139.6917, tz: 'Asia/Tokyo', place: '東京',
    anchor: new Date(), // スライダー 0 の時刻
    offset: 0,          // スライダーのずれ [分]
    showLines: true, showConNames: true, showStarNames: true, showGrid: true, red: false,
    magLimit: 5,
    selected: null,     // {type:'star', star} | {type:'con', con}
    playing: false,
  };

  const SETTINGS_KEY = 'star-map-app/settings';
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!s) return false;
      for (const k of ['lat', 'lon', 'tz', 'place', 'showLines', 'showConNames', 'showStarNames', 'showGrid', 'red', 'magLimit']) {
        if (k in s) state[k] = s[k];
      }
      return true;
    } catch (e) { return false; }
  }
  function saveSettings() {
    try {
      const { lat, lon, tz, place, showLines, showConNames, showStarNames, showGrid, red, magLimit } = state;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ lat, lon, tz, place, showLines, showConNames, showStarNames, showGrid, red, magLimit }));
    } catch (e) { /* 保存できない環境では無視 */ }
  }

  const currentDate = () => new Date(state.anchor.getTime() + state.offset * 60000);

  // ---------- 投影 ----------

  const canvas = $('sky');
  const ctx = canvas.getContext('2d');
  let view = { size: 0, cx: 0, cy: 0, R: 0, dpr: 1 };

  // 天頂中心の立体射影。上が北、左が東（空を見上げた向き）
  function project(alt, az) {
    const zd = 90 - alt;
    const r = view.R * Math.tan((zd / 2) * A.DEG); // tan(45°)=1 なので地平線で r=R
    return {
      x: view.cx - r * Math.sin(az * A.DEG),
      y: view.cy - r * Math.cos(az * A.DEG),
    };
  }

  function resize() {
    const rect = $('canvasWrap').getBoundingClientRect();
    const size = Math.max(200, Math.floor(rect.width));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const margin = size < 420 ? 22 : 30;
    view = { size, cx: size / 2, cy: size / 2, R: size / 2 - margin, dpr };
    render();
  }

  // ---------- 計算 ----------

  let frame = null; // 直近の計算結果 (タップ判定に使う)

  function compute() {
    const date = currentDate();
    const jd = A.julianDate(date);
    const lstDeg = A.lst(jd, state.lon);
    const toHz = (ra, dec) => {
      const p = A.precess(ra, dec, jd);
      return A.equatorialToHorizontal(p.ra, p.dec, lstDeg, state.lat);
    };

    const stars = [];
    for (const s of STARS) {
      const h = toHz(s.ra, s.dec);
      if (h.alt < 0) continue;
      const p = project(h.alt, h.az);
      stars.push({ star: s, alt: h.alt, az: h.az, x: p.x, y: p.y });
    }

    const cons = CONS.map((c) => {
      const lines = c.lines.map((seg) => seg.map(([ra, dec]) => {
        const h = toHz(ra, dec);
        const p = project(Math.max(h.alt, -40), h.az);
        return { alt: h.alt, az: h.az, x: p.x, y: p.y };
      }));
      const lh = toHz(c.label[0], c.label[1]);
      const lp = project(lh.alt, lh.az);
      let maxAlt = -90;
      for (const seg of lines) for (const v of seg) maxAlt = Math.max(maxAlt, v.alt);
      return { con: c, lines, label: { alt: lh.alt, az: lh.az, x: lp.x, y: lp.y }, maxAlt };
    });

    const sunEq = A.sunPosition(jd);
    const sun = A.equatorialToHorizontal(sunEq.ra, sunEq.dec, lstDeg, state.lat);
    const moon = A.moonHorizontal(jd, state.lat, state.lon);
    frame = { date, jd, lstDeg, stars, cons, sun, moon };
    return frame;
  }

  // ---------- 描画 ----------

  function palette() {
    if (state.red) {
      return {
        sky: '#140000', skyEdge: '#0a0000', outside: '#050000', grid: 'rgba(255,60,60,0.18)',
        horizon: '#7a1a1a', text: '#ff5a5a', textMuted: '#a33a3a', line: 'rgba(255,70,70,0.45)',
        lineSel: '#ff8080', conName: 'rgba(255,90,90,0.75)', starName: '#ff7070', star: () => '#ff6060',
        sel: '#ff9090',
      };
    }
    return {
      sky: null, skyEdge: null, outside: '#070b1a', grid: 'rgba(140,170,255,0.16)',
      horizon: '#4a5f9a', text: '#dfe7ff', textMuted: '#8a9ac4', line: 'rgba(120,170,255,0.5)',
      lineSel: '#ffd36b', conName: 'rgba(170,200,255,0.8)', starName: '#fff3c4', star: starColor,
      sel: '#ffd36b',
    };
  }

  function skyColors(sunAlt) {
    // 太陽高度に応じて空の色を変える
    if (sunAlt > 0) return ['#3d6fb8', '#7fa9de'];
    if (sunAlt > -6) return ['#1d3266', '#4a5f9a'];
    if (sunAlt > -12) return ['#111d42', '#253765'];
    if (sunAlt > -18) return ['#0b1330', '#16224a'];
    return ['#050a1c', '#0d1532'];
  }

  function starColor(s) {
    const t = s.temp || 6000;
    if (t >= 20000) return '#a9c1ff';
    if (t >= 10000) return '#c8d7ff';
    if (t >= 7500) return '#eef1ff';
    if (t >= 6000) return '#fff8ea';
    if (t >= 5000) return '#ffe8b8';
    if (t >= 4000) return '#ffcf8f';
    return '#ffb07a';
  }

  function starRadius(mag) {
    const scale = Math.max(0.75, Math.min(1.3, view.size / 600));
    return Math.max(0.6, (5.6 - mag) * 0.95) * scale;
  }

  function starLabel(s) {
    if (s.ja.includes('北極星')) return '北極星';
    if (s.ja) return s.ja.replace(/（.*?）/, '');
    return '';
  }

  function render() {
    if (!view.size) return;
    const f = compute();
    const pal = palette();
    const { cx, cy, R, size, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = pal.outside;
    ctx.fillRect(0, 0, size, size);

    // 空
    let inner, outer;
    if (state.red) { inner = pal.sky; outer = pal.skyEdge; } else { [inner, outer] = skyColors(f.sun.alt); }
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    if (state.showGrid) drawGrid(pal);
    const sel = state.selected;
    if (state.showLines) drawConstellationLines(f, pal, sel);
    drawStars(f, pal, sel);
    drawSunMoon(f, pal);
    placed = [];
    if (state.showStarNames) drawStarNames(f, pal);
    if (state.showConNames) drawConstellationNames(f, pal, sel);
    if (sel && sel.type === 'star') drawStarSelection(f, pal, sel.star);
    ctx.restore();

    // 地平線と方位
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = pal.horizon;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawCompass(pal);

    updateSummary(f);
    updateConList(f);
    updateInfo(f);
  }

  function drawGrid(pal) {
    const { cx, cy, R } = view;
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (const alt of [30, 60]) {
      const r = R * Math.tan(((90 - alt) / 2) * A.DEG);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let az = 0; az < 360; az += 45) {
      const p = project(0, az);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = pal.textMuted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const alt of [30, 60]) {
      const p = project(alt, 157.5);
      ctx.fillText(alt + '°', p.x + 2, p.y);
    }
    ctx.fillText('天頂', cx + 3, cy - 6);
  }

  function drawConstellationLines(f, pal, sel) {
    ctx.lineWidth = 1.1;
    for (const c of f.cons) {
      const isSel = sel && sel.type === 'con' && sel.con.abbr === c.con.abbr;
      ctx.strokeStyle = isSel ? pal.lineSel : pal.line;
      ctx.lineWidth = isSel ? 2 : 1.1;
      ctx.beginPath();
      for (const seg of c.lines) {
        for (let i = 1; i < seg.length; i++) {
          const a = seg[i - 1], b = seg[i];
          if (a.alt < 0 && b.alt < 0) continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
      }
      ctx.stroke();
    }
  }

  function drawStars(f, pal) {
    for (const p of f.stars) {
      const s = p.star;
      if (s.mag > state.magLimit) continue;
      const r = starRadius(s.mag);
      // 地平線近くは大気減光で暗く見える
      const ext = p.alt < 10 ? 0.45 + 0.055 * p.alt : 1;
      ctx.globalAlpha = ext;
      ctx.fillStyle = pal.star(s);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (s.mag < 1.5) {
        ctx.globalAlpha = 0.25 * ext;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawStarSelection(f, pal, star) {
    const p = f.stars.find((q) => q.star === star);
    if (!p) return;
    ctx.strokeStyle = pal.sel;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, starRadius(star.mag) + 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawSunMoon(f, pal) {
    if (f.sun.alt > -1) {
      const p = project(Math.max(f.sun.alt, 0), f.sun.az);
      ctx.fillStyle = state.red ? '#ff7070' : '#ffd84a';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      label(p.x, p.y + 18, '太陽', pal.text, 12);
    }
    if (f.moon.alt > -0.5) {
      const p = project(Math.max(f.moon.alt, 0), f.moon.az);
      drawMoonDisc(p.x, p.y, 8, f.moon.phaseAngle, pal);
      label(p.x, p.y + 18, '月', pal.text, 12);
    }
  }

  // 月の満ち欠け (北半球で南を向いたときの見え方を簡易表示)
  function drawMoonDisc(x, y, r, phase, pal) {
    const lit = state.red ? '#ff8080' : '#f4f1de';
    const dark = state.red ? '#300808' : '#2a2f45';
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const waxing = phase < 180;
    const k = Math.cos(phase * A.DEG); // 1=新月, -1=満月
    ctx.fillStyle = lit;
    ctx.beginPath();
    // 明るい側の半円
    ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);
    // 明暗境界 (楕円)
    ctx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing ? true : false);
    ctx.fill();
    ctx.strokeStyle = pal.textMuted;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 文字が重ならないよう、置いたラベルの矩形を覚えておく
  let placed = [];
  function reserve(x, y, w, h, force) {
    const box = { x0: x - 2, y0: y - 2, x1: x + w + 2, y1: y + h + 2 };
    if (!force && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return false;
    placed.push(box);
    return true;
  }

  function label(x, y, text, color, px, weight) {
    ctx.font = `${weight || ''} ${px}px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = state.red ? 'rgba(10,0,0,0.85)' : 'rgba(5,10,28,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawConstellationNames(f, pal, sel) {
    const px = view.size < 420 ? 10 : 12;
    for (const c of f.cons) {
      if (c.label.alt < 2) continue;
      const isSel = sel && sel.type === 'con' && sel.con.abbr === c.con.abbr;
      const size = isSel ? px + 2 : px;
      ctx.font = `${isSel ? 'bold' : ''} ${size}px system-ui, sans-serif`;
      const w = ctx.measureText(c.con.ja).width;
      if (!reserve(c.label.x - w / 2, c.label.y - size / 2, w, size, isSel)) continue;
      label(c.label.x, c.label.y, c.con.ja, isSel ? pal.lineSel : pal.conName, size, isSel ? 'bold' : '');
    }
  }

  function drawStarNames(f, pal) {
    const px = view.size < 420 ? 10 : 11;
    const maxMag = view.size < 420 ? 1.6 : 2.2;
    for (const p of f.stars) {
      const s = p.star;
      if (!s.ja || s.mag > maxMag || s.mag > state.magLimit) continue;
      const txt = starLabel(s);
      ctx.font = `${px}px system-ui, sans-serif`;
      const w = ctx.measureText(txt).width;
      if (!reserve(p.x + starRadius(s.mag) + 3, p.y - px / 2, w, px)) continue;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = state.red ? 'rgba(10,0,0,0.85)' : 'rgba(5,10,28,0.85)';
      const x = p.x + starRadius(s.mag) + 3;
      ctx.strokeText(txt, x, p.y);
      ctx.fillStyle = pal.starName;
      ctx.fillText(txt, x, p.y);
    }
  }

  function drawCompass(pal) {
    const big = view.size < 420 ? 14 : 16;
    const small = view.size < 420 ? 9 : 11;
    const off = view.size < 420 ? 11 : 15;
    const dirs = [['北', 0], ['北東', 45], ['東', 90], ['南東', 135], ['南', 180], ['南西', 225], ['西', 270], ['北西', 315]];
    for (const [name, az] of dirs) {
      const major = name.length === 1;
      const x = view.cx - (view.R + off) * Math.sin(az * A.DEG);
      const y = view.cy - (view.R + off) * Math.cos(az * A.DEG);
      label(x, y, name, major ? (name === '北' ? (state.red ? '#ff7a7a' : '#ff8f8f') : pal.text) : pal.textMuted, major ? big : small, major ? 'bold' : '');
    }
  }

  // ---------- タップ判定 ----------

  function pick(x, y) {
    if (!frame) return null;
    if (Math.hypot(x - view.cx, y - view.cy) > view.R + 4) return null;
    let best = null, bestScore = Infinity;
    for (const p of frame.stars) {
      if (p.star.mag > state.magLimit) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > 16) continue;
      const score = d - (5 - p.star.mag) * 1.5;
      if (score < bestScore) { bestScore = score; best = p.star; }
    }
    if (best) return { type: 'star', star: best };

    let bestCon = null, bestD = 14;
    for (const c of frame.cons) {
      if (state.showConNames && c.label.alt > 2) {
        const d = Math.hypot(c.label.x - x, c.label.y - y) - 10;
        if (d < bestD) { bestD = d; bestCon = c.con; }
      }
      if (!state.showLines) continue;
      for (const seg of c.lines) {
        for (let i = 1; i < seg.length; i++) {
          const a = seg[i - 1], b = seg[i];
          if (a.alt < 0 && b.alt < 0) continue;
          const d = distToSegment(x, y, a, b);
          if (d < bestD) { bestD = d; bestCon = c.con; }
        }
      }
    }
    return bestCon ? { type: 'con', con: bestCon } : null;
  }

  function distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * view.size;
    const y = ((ev.clientY - rect.top) / rect.height) * view.size;
    state.selected = pick(x, y);
    render();
  });

  // ---------- 情報表示 ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtAltAz = (alt, az) => `高度 ${alt.toFixed(1)}° ／ 方位 ${A.azimuthName(az)}（${az.toFixed(1)}°）`;

  function conJa(abbr) {
    const c = CON_BY_ABBR[abbr];
    return c ? c.ja : abbr;
  }

  function designation(s) {
    if (s.bayer) return `${conJa(s.con)} ${s.bayer}星`;
    if (s.flam) return `${conJa(s.con)} ${s.flam}番星`;
    return `HR ${s.hr}`;
  }

  function fmtRa(ra) {
    const h = ra / 15;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = Math.round(((h - hh) * 60 - mm) * 60);
    return `${hh}h ${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
  }
  function fmtDec(dec) {
    const s = dec < 0 ? '−' : '+';
    const a = Math.abs(dec), d = Math.floor(a), m = Math.round((a - d) * 60);
    return `${s}${d}° ${String(m).padStart(2, '0')}′`;
  }

  function updateInfo(f) {
    const el = $('info');
    const sel = state.selected;
    if (!sel) {
      el.innerHTML = '<p class="muted">星や星座をタップしてください。</p>';
      return;
    }
    if (sel.type === 'star') {
      const s = sel.star;
      const p = f.stars.find((q) => q.star === s);
      const title = s.ja || s.name || designation(s);
      const sub = [s.ja && s.name ? s.name : '', s.ja || s.name ? designation(s) : ''].filter(Boolean).join(' ／ ');
      el.innerHTML = `
        <h2>${esc(title)}<span class="sub">${esc(sub)}</span></h2>
        <dl>
          <dt>星座</dt><dd>${esc(conJa(s.con) || '—')}</dd>
          <dt>等級</dt><dd>${s.mag.toFixed(2)} 等</dd>
          <dt>位置</dt><dd>${p ? esc(fmtAltAz(p.alt, p.az)) : 'この時刻は地平線の下です'}</dd>
          <dt>赤経・赤緯</dt><dd>${fmtRa(s.ra)} ／ ${fmtDec(s.dec)}（J2000）</dd>
          ${s.temp ? `<dt>表面温度の目安</dt><dd>約 ${s.temp.toLocaleString('ja-JP')} K</dd>` : ''}
        </dl>`;
      return;
    }
    const c = sel.con;
    const fc = f.cons.find((q) => q.con === c);
    const members = f.stars.filter((p) => p.star.con === c.abbr).sort((a, b) => a.star.mag - b.star.mag);
    const brightest = members[0];
    const visible = fc && fc.maxAlt > 0;
    el.innerHTML = `
      <h2>${esc(c.ja)}<span class="sub">${esc(c.la)}（${esc(c.abbr)}）</span></h2>
      <dl>
        <dt>位置</dt><dd>${visible ? esc(fmtAltAz(Math.max(fc.label.alt, 0), fc.label.az)) + ' 付近' : 'この時刻は地平線の下です'}</dd>
        <dt>見えている星</dt><dd>${members.length} 個（5等級まで）</dd>
        ${brightest ? `<dt>いちばん明るい星</dt><dd>${esc(brightest.star.ja || brightest.star.name || designation(brightest.star))}（${brightest.star.mag.toFixed(1)} 等）</dd>` : ''}
      </dl>`;
  }

  function fmtDateTime(date) {
    const p = A.zonedParts(date, state.tz);
    const wd = '日月火水木金土'[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
    const off = A.tzOffsetMinutes(date, state.tz);
    const sign = off >= 0 ? '+' : '−';
    const oh = Math.floor(Math.abs(off) / 60), om = Math.abs(off) % 60;
    return `${p.year}年${p.month}月${p.day}日(${wd}) ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}（UTC${sign}${oh}${om ? ':' + String(om).padStart(2, '0') : ''}）`;
  }

  function updateSummary(f) {
    const ns = state.lat >= 0 ? `北緯${state.lat.toFixed(2)}°` : `南緯${(-state.lat).toFixed(2)}°`;
    const ew = state.lon >= 0 ? `東経${state.lon.toFixed(2)}°` : `西経${(-state.lon).toFixed(2)}°`;
    const sky = A.skyState(f.sun.alt);
    const moonAge = A.moonAgeDays(f.moon.phaseAngle).toFixed(1);
    const moonTxt = f.moon.alt > 0 ? `月は${A.azimuthName(f.moon.az)}の空（月齢${moonAge}）` : `月は沈んでいます（月齢${moonAge}）`;
    $('summary').textContent = `${state.place ? state.place + '（' + ns + ' ' + ew + '）' : ns + ' ' + ew} ・ ${fmtDateTime(f.date)} ・ ${sky} ・ ${moonTxt}`;
    const dt = A.formatLocalInput(f.date, state.tz);
    const di = $('dateInput');
    if (document.activeElement !== di) di.value = dt;
    const o = state.offset;
    $('sliderValue').textContent = o === 0 ? '±0分' : `${o > 0 ? '+' : '−'}${Math.floor(Math.abs(o) / 60)}:${String(Math.abs(o) % 60).padStart(2, '0')}`;
  }

  let lastListKey = '';
  function updateConList(f) {
    const list = f.cons
      .filter((c) => c.label.alt > 0)
      .sort((a, b) => b.label.alt - a.label.alt);
    // 同じ星座 (へび座の頭部/尾部) は 1 つにまとめる
    const seen = new Set();
    const items = [];
    for (const c of list) {
      if (seen.has(c.con.abbr)) continue;
      seen.add(c.con.abbr);
      items.push(c);
    }
    $('visibleCount').textContent = `（${items.length}）`;
    const selAbbr = state.selected && state.selected.type === 'con' ? state.selected.con.abbr : '';
    const key = items.map((c) => c.con.id + Math.round(c.label.alt) + A.azimuthName(c.label.az)).join() + selAbbr;
    if (key === lastListKey) return;
    lastListKey = key;
    const ol = $('conList');
    ol.innerHTML = '';
    for (const c of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      if (c.con.abbr === selAbbr) b.classList.add('selected');
      b.innerHTML = `<span>${esc(c.con.ja)}</span><span class="dir">${A.azimuthName(c.label.az)}・高度${Math.round(c.label.alt)}°</span>`;
      b.addEventListener('click', () => {
        state.selected = { type: 'con', con: c.con };
        render();
        $('info').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      li.appendChild(b);
      ol.appendChild(li);
    }
  }

  // ---------- 入力 ----------

  function initControls() {
    const citySel = $('citySelect');
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = '（緯度・経度を直接入力）';
    citySel.appendChild(custom);
    CITIES.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = c.name;
      citySel.appendChild(o);
    });

    const tzSel = $('tzSelect');
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { /* 古いブラウザ */ }
    const extra = new Set([browserTz, 'UTC', ...CITIES.map((c) => c.tz)]);
    for (const z of extra) if (!zones.includes(z)) zones.push(z);
    zones.sort();
    for (const z of zones) {
      const o = document.createElement('option');
      o.value = z;
      o.textContent = z === browserTz ? `${z}（この端末）` : z;
      tzSel.appendChild(o);
    }

    citySel.addEventListener('change', () => {
      const c = CITIES[+citySel.value];
      if (!c) return;
      Object.assign(state, { lat: c.lat, lon: c.lon, tz: c.tz, place: c.name });
      syncInputs();
      saveSettings();
      render();
    });

    const onCoord = () => {
      const lat = parseFloat($('latInput').value);
      const lon = parseFloat($('lonInput').value);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      state.lat = lat;
      state.lon = lon;
      state.place = '';
      citySel.value = '';
      saveSettings();
      render();
    };
    $('latInput').addEventListener('change', onCoord);
    $('lonInput').addEventListener('change', onCoord);

    $('geoBtn').addEventListener('click', () => {
      const st = $('geoStatus');
      if (!navigator.geolocation) { st.textContent = 'この端末では現在地を取得できません。'; return; }
      st.textContent = '現在地を取得しています…';
      navigator.geolocation.getCurrentPosition((pos) => {
        state.lat = +pos.coords.latitude.toFixed(4);
        state.lon = +pos.coords.longitude.toFixed(4);
        state.place = '現在地';
        state.tz = browserTz;
        citySel.value = '';
        syncInputs();
        saveSettings();
        st.textContent = '現在地を設定しました（タイムゾーンはこの端末の設定を使います）。';
        render();
      }, (err) => {
        st.textContent = err.code === 1
          ? '位置情報の利用が許可されませんでした。都市を選ぶか、緯度・経度を入力してください。'
          : '現在地を取得できませんでした。都市を選ぶか、緯度・経度を入力してください。';
      }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    });

    tzSel.addEventListener('change', () => {
      // 入力欄の壁時計時刻はそのままに、タイムゾーンだけ変える
      const wall = A.formatLocalInput(currentDate(), state.tz);
      state.tz = tzSel.value;
      state.anchor = A.parseLocalInput(wall, state.tz);
      state.offset = 0;
      $('timeSlider').value = 0;
      saveSettings();
      render();
    });

    $('dateInput').addEventListener('change', () => {
      const d = A.parseLocalInput($('dateInput').value, state.tz);
      if (!d) return;
      state.anchor = d;
      state.offset = 0;
      $('timeSlider').value = 0;
      render();
    });

    $('timeSlider').addEventListener('input', () => {
      state.offset = +$('timeSlider').value;
      render();
    });

    document.querySelectorAll('[data-shift]').forEach((b) => {
      b.addEventListener('click', () => {
        state.anchor = new Date(state.anchor.getTime() + +b.dataset.shift * 60000);
        render();
      });
    });

    $('nowBtn').addEventListener('click', () => {
      state.anchor = new Date();
      state.offset = 0;
      $('timeSlider').value = 0;
      render();
    });

    let timer = null;
    $('playBtn').addEventListener('click', () => {
      state.playing = !state.playing;
      $('playBtn').setAttribute('aria-pressed', String(state.playing));
      $('playBtn').textContent = state.playing ? '❚❚ 停止' : '▶ 再生';
      if (state.playing) {
        timer = setInterval(() => {
          state.anchor = new Date(state.anchor.getTime() + 4 * 60000); // 1 コマ 4 分
          render();
        }, 60);
      } else {
        clearInterval(timer);
      }
    });

    const bindCheck = (id, key) => {
      $(id).addEventListener('change', () => {
        state[key] = $(id).checked;
        if (key === 'red') document.body.classList.toggle('red', state.red);
        saveSettings();
        render();
      });
    };
    bindCheck('optLines', 'showLines');
    bindCheck('optConNames', 'showConNames');
    bindCheck('optStarNames', 'showStarNames');
    bindCheck('optGrid', 'showGrid');
    bindCheck('optRed', 'red');

    $('magSlider').addEventListener('input', () => {
      state.magLimit = +$('magSlider').value;
      $('magValue').textContent = state.magLimit.toFixed(1);
      saveSettings();
      render();
    });
  }

  function syncInputs() {
    $('latInput').value = state.lat;
    $('lonInput').value = state.lon;
    $('tzSelect').value = state.tz;
    const idx = CITIES.findIndex((c) => c.name === state.place);
    $('citySelect').value = idx >= 0 ? String(idx) : '';
    $('optLines').checked = state.showLines;
    $('optConNames').checked = state.showConNames;
    $('optStarNames').checked = state.showStarNames;
    $('optGrid').checked = state.showGrid;
    $('optRed').checked = state.red;
    $('magSlider').value = state.magLimit;
    $('magValue').textContent = Number(state.magLimit).toFixed(1);
    document.body.classList.toggle('red', state.red);
  }

  // ---------- 起動 ----------

  loadSettings();
  initControls();
  syncInputs();
  if ($('tzSelect').value !== state.tz) { state.tz = 'Asia/Tokyo'; $('tzSelect').value = state.tz; }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe($('canvasWrap'));
  resize();
})();
