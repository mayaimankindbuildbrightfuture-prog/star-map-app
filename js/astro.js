/*
 * 天文計算モジュール（ブラウザ・Node.js 両対応）
 *   - ユリウス日 / グリニッジ平均恒星時 / 地方恒星時
 *   - 歳差補正 (J2000.0 → 観測日)
 *   - 赤道座標 → 地平座標 (高度・方位)
 *   - 太陽・月の簡易位置
 *   - タイムゾーン付きの日時変換
 * 参考: J. Meeus, "Astronomical Algorithms" 2nd ed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Astro = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  const norm360 = (x) => ((x % 360) + 360) % 360;
  const sin = (d) => Math.sin(d * DEG);
  const cos = (d) => Math.cos(d * DEG);

  /** Date → ユリウス日 (UT) */
  function julianDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  /** ユリウス世紀 (J2000.0 起点) */
  function centuries(jd) {
    return (jd - 2451545.0) / 36525;
  }

  /** グリニッジ平均恒星時 [度] (Meeus 12.4) */
  function gmst(jd) {
    const t = centuries(jd);
    return norm360(
      280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - (t * t * t) / 38710000
    );
  }

  /** 地方恒星時 [度]。lon は東経を正とする */
  function lst(jd, lon) {
    return norm360(gmst(jd) + lon);
  }

  /**
   * 歳差補正: J2000.0 の赤経・赤緯 [度] を jd の平均春分点に変換 (Meeus 21.2〜21.4)
   * 章動・光行差は無視（誤差は 1 分角未満）。
   */
  function precess(ra, dec, jd) {
    const t = centuries(jd);
    const asec = 1 / 3600;
    const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * asec;
    const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * asec;
    const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * asec;
    const A = cos(dec) * sin(ra + zeta);
    const B = cos(theta) * cos(dec) * cos(ra + zeta) - sin(theta) * sin(dec);
    const C = sin(theta) * cos(dec) * cos(ra + zeta) + cos(theta) * sin(dec);
    return {
      ra: norm360(Math.atan2(A, B) * RAD + z),
      dec: Math.asin(Math.max(-1, Math.min(1, C))) * RAD,
    };
  }

  /**
   * 赤道座標 → 地平座標
   * @param ra,dec 観測日の赤経・赤緯 [度]
   * @param lstDeg 地方恒星時 [度]
   * @param lat 緯度 [度]
   * @returns {alt, az} 高度 [度], 方位 [度] (北=0, 東=90, 南=180, 西=270)
   */
  function equatorialToHorizontal(ra, dec, lstDeg, lat) {
    const H = lstDeg - ra; // 時角
    const sinAlt = sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(H);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;
    const y = -cos(dec) * sin(H);
    const x = sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(H);
    const az = norm360(Math.atan2(y, x) * RAD);
    return { alt, az };
  }

  /** 黄道座標 → 赤道座標 [度] */
  function eclipticToEquatorial(lon, lat, jd) {
    const t = centuries(jd);
    const eps = 23.439291 - 0.0130042 * t;
    const ra = Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * DEG) * sin(eps), cos(lon)) * RAD;
    const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * RAD;
    return { ra: norm360(ra), dec };
  }

  /** 太陽の視位置 (精度 0.01° 程度, Meeus 25 章の簡略式) */
  function sunPosition(jd) {
    const t = centuries(jd);
    const L0 = norm360(280.46646 + 36000.76983 * t + 0.0003032 * t * t);
    const M = norm360(357.52911 + 35999.05029 * t - 0.0001537 * t * t);
    const Cc =
      (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(M) +
      (0.019993 - 0.000101 * t) * sin(2 * M) +
      0.000289 * sin(3 * M);
    const omega = 125.04 - 1934.136 * t;
    const lon = L0 + Cc - 0.00569 - 0.00478 * sin(omega);
    const eq = eclipticToEquatorial(lon, 0, jd);
    return { ra: eq.ra, dec: eq.dec, lon: norm360(lon) };
  }

  /** 月の位置 (Meeus 47 章の主要項のみ, 精度 0.3° 程度) */
  function moonPosition(jd) {
    const t = centuries(jd);
    const Lp = norm360(218.3164477 + 481267.88123421 * t);
    const D = norm360(297.8501921 + 445267.1114034 * t);
    const M = norm360(357.5291092 + 35999.0502909 * t);
    const Mp = norm360(134.9633964 + 477198.8675055 * t);
    const F = norm360(93.272095 + 483202.0175233 * t);
    const lonTerms = [
      [0, 0, 1, 0, 6.288774], [2, 0, -1, 0, 1.274027], [2, 0, 0, 0, 0.658314],
      [0, 0, 2, 0, 0.213618], [0, 1, 0, 0, -0.185116], [0, 0, 0, 2, -0.114332],
      [2, 0, -2, 0, 0.058793], [2, -1, -1, 0, 0.057066], [2, 0, 1, 0, 0.053322],
      [2, -1, 0, 0, 0.045758], [0, 1, -1, 0, -0.040923], [1, 0, 0, 0, -0.03472],
      [0, 1, 1, 0, -0.030383], [2, 0, 0, -2, 0.015327], [0, 0, 1, 2, -0.012528],
      [0, 0, 1, -2, 0.01098],
    ];
    const latTerms = [
      [0, 0, 0, 1, 5.128122], [0, 0, 1, 1, 0.280602], [0, 0, 1, -1, 0.277693],
      [2, 0, 0, -1, 0.173237], [2, 0, -1, 1, 0.055413], [2, 0, -1, -1, 0.046271],
      [2, 0, 0, 1, 0.032573], [0, 0, 2, 1, 0.017198],
    ];
    let lon = Lp;
    for (const [d, m, mp, f, c] of lonTerms) lon += c * sin(d * D + m * M + mp * Mp + f * F);
    let lat = 0;
    for (const [d, m, mp, f, c] of latTerms) lat += c * sin(d * D + m * M + mp * Mp + f * F);
    lon = norm360(lon);
    const eq = eclipticToEquatorial(lon, lat, jd);
    const sun = sunPosition(jd);
    const elong = norm360(lon - sun.lon); // 0=新月, 180=満月
    return { ra: eq.ra, dec: eq.dec, lon, lat, phaseAngle: elong, illum: (1 - cos(elong)) / 2 };
  }

  /** 月の地平座標（地心→地表の視差を簡易補正） */
  function moonHorizontal(jd, lat, lon) {
    const m = moonPosition(jd);
    const h = equatorialToHorizontal(m.ra, m.dec, lst(jd, lon), lat);
    h.alt -= 0.951 * cos(h.alt); // 月の地平視差 ≈ 0.95°
    return Object.assign(h, { illum: m.illum, phaseAngle: m.phaseAngle });
  }

  /** 恒星 (J2000 座標) の地平座標 */
  function starHorizontal(ra2000, dec2000, jd, lat, lon) {
    const p = precess(ra2000, dec2000, jd);
    return equatorialToHorizontal(p.ra, p.dec, lst(jd, lon), lat);
  }

  /** 方位角 → 16 方位の日本語 */
  function azimuthName(az) {
    const names = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
      '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
    return names[Math.round(norm360(az) / 22.5) % 16];
  }

  /** 太陽高度から空の状態 */
  function skyState(sunAlt) {
    if (sunAlt > 0) return '昼間';
    if (sunAlt > -6) return '市民薄明';
    if (sunAlt > -12) return '航海薄明';
    if (sunAlt > -18) return '天文薄明';
    return '夜';
  }

  /** 月齢の目安 (日) */
  function moonAgeDays(phaseAngle) {
    return (norm360(phaseAngle) / 360) * 29.530589;
  }

  // ---------- タイムゾーン ----------

  const dtfCache = {};
  function dtf(timeZone) {
    if (!dtfCache[timeZone]) {
      dtfCache[timeZone] = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }
    return dtfCache[timeZone];
  }

  /** Date を指定タイムゾーンの壁時計時刻の各要素に分解 */
  function zonedParts(date, timeZone) {
    const parts = {};
    for (const p of dtf(timeZone).formatToParts(date)) parts[p.type] = p.value;
    return {
      year: +parts.year, month: +parts.month, day: +parts.day,
      hour: +parts.hour, minute: +parts.minute, second: +parts.second,
    };
  }

  /** そのタイムゾーンの UTC からのオフセット [分] */
  function tzOffsetMinutes(date, timeZone) {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  }

  /** 指定タイムゾーンの壁時計時刻 → Date (UTC) */
  function zonedToDate(year, month, day, hour, minute, timeZone) {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    let off = tzOffsetMinutes(new Date(guess), timeZone);
    let t = guess - off * 60000;
    const off2 = tzOffsetMinutes(new Date(t), timeZone);
    if (off2 !== off) t = guess - off2 * 60000; // 夏時間の切り替え付近
    return new Date(t);
  }

  /** "YYYY-MM-DDTHH:MM" (datetime-local の値) → Date */
  function parseLocalInput(value, timeZone) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (!m) return null;
    return zonedToDate(+m[1], +m[2], +m[3], +m[4], +m[5], timeZone);
  }

  /** Date → "YYYY-MM-DDTHH:MM" (指定タイムゾーン) */
  function formatLocalInput(date, timeZone) {
    const p = zonedParts(date, timeZone);
    const z = (n) => String(n).padStart(2, '0');
    return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
  }

  return {
    DEG, RAD, norm360,
    julianDate, centuries, gmst, lst, precess, equatorialToHorizontal,
    eclipticToEquatorial, sunPosition, moonPosition, moonHorizontal, starHorizontal,
    azimuthName, skyState, moonAgeDays,
    zonedParts, tzOffsetMinutes, zonedToDate, parseLocalInput, formatLocalInput,
  };
});
