// 天文計算の検証テスト:  npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../js/astro.js');

const stars = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stars.json'), 'utf8'));
const cons = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/constellations.json'), 'utf8'));
const F = Object.fromEntries(stars.fields.map((f, i) => [f, i]));
const byName = (name) => {
  const s = stars.stars.find((r) => r[F.name] === name);
  assert.ok(s, `star ${name} not found`);
  return { ra: s[F.ra], dec: s[F.dec], mag: s[F.mag] };
};

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} (expected ${expected} ± ${tol})`);
// 方位角の差 (-180..180)
const azDiff = (a, b) => ((a - b + 540) % 360) - 180;

const TOKYO = { lat: 35.6895, lon: 139.6917 };

test('ユリウス日: J2000.0 = 2451545.0', () => {
  near(A.julianDate(new Date(Date.UTC(2000, 0, 1, 12))), 2451545.0, 1e-9, 'JD');
});

test('恒星時: Meeus 例12.a / 12.b', () => {
  // 1987-04-10 0h UT → 13h10m46.3668s
  near(A.gmst(A.julianDate(new Date(Date.UTC(1987, 3, 10, 0)))), 197.693195, 1e-4, 'GMST 12.a');
  // 1987-04-10 19:21:00 UT → 128.7378734°
  near(A.gmst(A.julianDate(new Date(Date.UTC(1987, 3, 10, 19, 21)))), 128.7378734, 1e-4, 'GMST 12.b');
});

test('地平座標: Meeus 例13.b (ワシントンから見た金星)', () => {
  const jd = A.julianDate(new Date(Date.UTC(1987, 3, 10, 19, 21)));
  const lon = -(77 + 3 / 60 + 56 / 3600);
  const lat = 38 + 55 / 60 + 17 / 3600;
  const ra = (23 + 9 / 60 + 16.641 / 3600) * 15;
  const dec = -(6 + 43 / 60 + 11.61 / 3600);
  const h = A.equatorialToHorizontal(ra, dec, A.lst(jd, lon), lat);
  near(h.alt, 15.1249, 0.01, 'altitude');
  // Meeus は南から西回り 68.0337° → 北基準では 248.0337°
  near(h.az, 248.0337, 0.01, 'azimuth');
});

test('歳差: Meeus 例21.b (θ Per, J2000 → 2028-11-13)', () => {
  const jd = 2462088.69;
  // 例では固有運動を加えた J2000 位置 (41.054063°, 49.227750°) を歳差補正する
  const p = A.precess(41.054063, 49.22775, jd);
  near(p.ra, 41.547214, 0.002, 'RA');
  near(p.dec, 49.348483, 0.002, 'Dec');
});

test('北極星の高度 ≈ 観測地の緯度 (いろいろな時刻・場所)', () => {
  const polaris = byName('Polaris');
  const places = [
    { name: '那覇', lat: 26.2124, lon: 127.6792 },
    { name: '東京', ...TOKYO },
    { name: '札幌', lat: 43.0618, lon: 141.3545 },
    { name: 'ロンドン', lat: 51.5074, lon: -0.1278 },
  ];
  for (const p of places) {
    for (let h = 0; h < 24; h += 3) {
      const jd = A.julianDate(new Date(Date.UTC(2026, 9, 27, h)));
      const hz = A.starHorizontal(polaris.ra, polaris.dec, jd, p.lat, p.lon);
      near(hz.alt, p.lat, 0.8, `${p.name} ${h}h UT のポラリス高度`);
      assert.ok(Math.abs(azDiff(hz.az, 0)) < 2, `${p.name}: 方位はほぼ北 (${hz.az})`);
    }
  }
});

test('東京・1月15日22時(JST): オリオン座が南の空に見える', () => {
  const date = A.zonedToDate(2026, 1, 15, 22, 0, 'Asia/Tokyo');
  assert.equal(date.toISOString(), '2026-01-15T13:00:00.000Z');
  const jd = A.julianDate(date);
  for (const name of ['Betelgeuse', 'Rigel', 'Alnilam', 'Mintaka', 'Alnitak', 'Bellatrix']) {
    const s = byName(name);
    const hz = A.starHorizontal(s.ra, s.dec, jd, TOKYO.lat, TOKYO.lon);
    assert.ok(hz.alt > 30, `${name} 高度 ${hz.alt.toFixed(1)}°`);
    assert.ok(Math.abs(azDiff(hz.az, 180)) < 45, `${name} 方位 ${hz.az.toFixed(1)}° (南付近)`);
  }
  // 三つ星 (アルニラム) は南中付近: 高度 ≈ 90 - 35.7 - 1.2 ≈ 53°
  const al = byName('Alnilam');
  const hz = A.starHorizontal(al.ra, al.dec, jd, TOKYO.lat, TOKYO.lon);
  near(hz.alt, 53, 2.5, 'アルニラム高度');
});

test('東京・夏の夜 (8月1日21時JST): さそり座アンタレスが南、冬のオリオンは地平線下', () => {
  const jd = A.julianDate(A.zonedToDate(2026, 8, 1, 21, 0, 'Asia/Tokyo'));
  const ant = byName('Antares');
  const h1 = A.starHorizontal(ant.ra, ant.dec, jd, TOKYO.lat, TOKYO.lon);
  assert.ok(h1.alt > 15 && Math.abs(azDiff(h1.az, 180)) < 40, `Antares ${h1.alt} ${h1.az}`);
  const bet = byName('Betelgeuse');
  assert.ok(A.starHorizontal(bet.ra, bet.dec, jd, TOKYO.lat, TOKYO.lon).alt < 0);
  // ベガは天頂付近
  const vega = byName('Vega');
  assert.ok(A.starHorizontal(vega.ra, vega.dec, jd, TOKYO.lat, TOKYO.lon).alt > 60);
});

test('南天: シドニーではみなみじゅうじ座が見え、東京からは周極星のポラリスが見えない', () => {
  const syd = { lat: -33.8688, lon: 151.2093 };
  const jd = A.julianDate(A.zonedToDate(2026, 5, 1, 21, 0, 'Australia/Sydney'));
  const acrux = byName('Acrux');
  assert.ok(A.starHorizontal(acrux.ra, acrux.dec, jd, syd.lat, syd.lon).alt > 40);
  const pol = byName('Polaris');
  assert.ok(A.starHorizontal(pol.ra, pol.dec, jd, syd.lat, syd.lon).alt < 0);
});

test('太陽: 東京の夏至の南中高度 ≈ 90 - 緯度 + 23.44', () => {
  // 2026-06-21 11:40 JST 頃に南中
  let best = -90;
  for (let m = 0; m < 120; m += 2) {
    const jd = A.julianDate(A.zonedToDate(2026, 6, 21, 11, m, 'Asia/Tokyo'));
    const s = A.sunPosition(jd);
    best = Math.max(best, A.equatorialToHorizontal(s.ra, s.dec, A.lst(jd, TOKYO.lon), TOKYO.lat).alt);
  }
  near(best, 90 - TOKYO.lat + 23.44, 0.1, '南中高度');
});

test('月: Meeus 例47.a (1992-04-12 0h TD)', () => {
  const m = A.moonPosition(2448724.5);
  near(m.lon, 133.162655, 0.3, '黄経');
  near(m.lat, -3.229126, 0.3, '黄緯');
  near(m.ra, 134.688470, 0.4, '赤経');
  near(m.dec, 13.768368, 0.3, '赤緯');
});

test('月: 2026-03-03 の皆既月食の頃はほぼ満月', () => {
  const m = A.moonPosition(A.julianDate(new Date(Date.UTC(2026, 2, 3, 11, 33))));
  assert.ok(m.illum > 0.99, `illum ${m.illum}`);
});

test('タイムゾーン変換 (夏時間を含む)', () => {
  assert.equal(A.zonedToDate(2026, 7, 4, 21, 0, 'America/New_York').toISOString(), '2026-07-05T01:00:00.000Z');
  assert.equal(A.zonedToDate(2026, 1, 4, 21, 0, 'America/New_York').toISOString(), '2026-01-05T02:00:00.000Z');
  assert.equal(A.parseLocalInput('2026-10-27T23:45', 'Asia/Tokyo').toISOString(), '2026-10-27T14:45:00.000Z');
  assert.equal(A.formatLocalInput(new Date('2026-10-27T14:45:00Z'), 'Asia/Tokyo'), '2026-10-27T23:45');
  assert.equal(A.tzOffsetMinutes(new Date('2026-10-27T14:45:00Z'), 'Asia/Kolkata'), 330);
});

test('方位名', () => {
  assert.equal(A.azimuthName(0), '北');
  assert.equal(A.azimuthName(90), '東');
  assert.equal(A.azimuthName(170), '南');
  assert.equal(A.azimuthName(202), '南南西');
  assert.equal(A.azimuthName(355), '北');
});

test('データ: 5等級までの恒星と 88 星座', () => {
  assert.ok(stars.stars.length > 1500, `stars: ${stars.stars.length}`);
  assert.ok(stars.stars.every((s) => s[F.mag] <= 5.0));
  const ids = new Set(cons.constellations.map((c) => c.abbr));
  assert.equal(ids.size, 88);
  for (const c of cons.constellations) {
    assert.ok(c.ja.endsWith('座'), c.id);
    assert.ok(c.lines.length > 0, `${c.id} に星座線がない`);
  }
  const ja = Object.fromEntries(stars.stars.filter((s) => s[F.ja]).map((s) => [s[F.name], s[F.ja]]));
  assert.equal(ja.Sirius, 'シリウス');
  assert.match(ja.Vega, /^ベガ/);
  assert.match(ja.Polaris, /北極星/);
  // 星座線の頂点はカタログの星とほぼ一致する (星座線データと星データの整合)
  const pts = stars.stars.map((s) => [s[F.ra], s[F.dec]]);
  let miss = 0, total = 0;
  for (const c of cons.constellations) for (const seg of c.lines) for (const [ra, dec] of seg) {
    total++;
    const ok = pts.some(([r, d]) => Math.abs(d - dec) < 0.1 && Math.abs(azDiff(r, ra)) * Math.cos(dec * A.DEG) < 0.1);
    if (!ok) miss++;
  }
  assert.ok(miss / total < 0.15, `星座線の頂点のうち対応する星がない割合: ${miss}/${total}`);
});
