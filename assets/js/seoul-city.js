/*
 * Seoul, a small living city, shown as a screen-wide strip along the bottom of every page.
 *
 * An isometric pixel-art slice of Seoul drawn entirely in code (no image assets) and
 * animated as a tiny simulation: cars and buses obey traffic signals, people walk the
 * sidewalks and cross at crosswalks, Line 2 trains run on the viaduct, boats cruise the
 * Han River, and the Namsan cable car climbs to N Seoul Tower. The trees follow the
 * current season in Seoul, and the city switches to night (lit windows, street lamps,
 * the rainbow fountain) whenever the site is shown in its dark theme.
 *
 * World: an isometric grid with tile coordinates (gx, gy). The strip shows the slice
 * 0 <= gx + gy < VB, which projects to a horizontal band on screen, so the city reads
 * as a panorama: Gangnam on the left, the Han River and Banpo Bridge in the middle and
 * Gangbuk (Myeongdong, Gyeongbokgung, Namsan, Bukchon, Jongno) on the right.
 *
 * Rendering: drawn at a low native resolution and scaled up with nearest-neighbour
 * sampling. The ground is rasterised once per pixel by inverse isometric projection.
 * Every static object is pre-rendered to its own sprite and depth-sorted once; moving
 * agents are inserted into that order each frame with a footprint test.
 *
 * Debug/preview URL parameters: ?time=day|night  ?season=spring|summer|autumn|winter
 */
(function () {
  'use strict';

  var host = document.getElementById('seoul-city');
  if (!host) return;

  // ---------------------------------------------------------------- constants
  var HW = 8, HH = 4;            // half tile width / height in pixels (2:1 isometric)
  var VB = 11;                   // depth of the strip: 0 <= gx + gy < VB
  var HEAD = 76;                 // headroom above the horizon for towers
  var UMIN = -104, UMAX = 104;   // generated world extent in u = gx - gy
  var RIVER_D = 5, LAKE_D = 3;   // water surface depth below ground
  var OX = -UMIN * HW, OY = HEAD; // world pixel position of tile corner (0,0)
  var GW = (UMAX - UMIN) * HW;   // world width in pixels
  var H = HEAD + VB * HH;        // canvas height
  var W = 800;                   // canvas width, set from the window size
  var CENTER_U = 1;              // the camera centres on Banpo Bridge

  // ---------------------------------------------------------------- time and season (KST)
  var qs = new URLSearchParams(window.location.search);
  function kst() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    return { h: d.getUTCHours(), m: d.getUTCMinutes(), mon: d.getUTCMonth() + 1 };
  }
  function seasonOf(mon) {
    if (mon >= 3 && mon <= 5) return 'spring';
    if (mon >= 6 && mon <= 8) return 'summer';
    if (mon >= 9 && mon <= 11) return 'autumn';
    return 'winter';
  }
  var FORCE_TIME = qs.get('time'), FORCE_SEASON = qs.get('season');
  var SEASON = FORCE_SEASON || seasonOf(kst().mon);
  function themeDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  var NIGHT = FORCE_TIME ? FORCE_TIME === 'night' : themeDark();
  var WINTER = SEASON === 'winter';

  // ---------------------------------------------------------------- colour helpers
  function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  function rgbOf(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function hexOf(r, g, b) { return '#' + ((1 << 24) | (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b)).toString(16).slice(1); }
  function mix(a, b, t) { var x = rgbOf(a), y = rgbOf(b); return hexOf(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
  function dk(h, k) { return mix(h, '#1b1830', k); }      // darker, cool-shifted
  function lt(h, k) { return mix(h, '#ffffff', k); }
  var nightCache = {};
  function toNight(h) {
    var c = rgbOf(h), l = (c[0] + c[1] + c[2]) / 3;
    return hexOf(c[0] * 0.30 + l * 0.06 + 14, c[1] * 0.34 + l * 0.06 + 18, c[2] * 0.48 + l * 0.08 + 44);
  }
  // Colours prefixed with '!' are emissive and keep their value at night.
  function col(c) {
    if (c.charCodeAt(0) === 33) return c.slice(1);
    if (!NIGHT || c.charCodeAt(0) !== 35) return c;
    return nightCache[c] || (nightCache[c] = toNight(c));
  }

  // ---------------------------------------------------------------- random helpers
  function hash(a, b, c) {
    var h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul((c | 0) + 7, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------------------------------------------------------------- projection
  function P(gx, gy, z) { return [Math.round(OX + (gx - gy) * HW), Math.round(OY + (gx + gy) * HH - (z || 0))]; }
  function inv(sx, sy) { var X = (sx + 0.5 - OX) / HW, Y = (sy + 0.5 - OY) / HH; return [(X + Y) / 2, (Y - X) / 2]; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

  // ---------------------------------------------------------------- painter
  // All drawing goes through rect(), so a painter can also run in "record" mode to
  // measure the pixel bounds of a sprite before it is rendered.
  function Painter(ctx, ox, oy) { this.ctx = ctx; this.ox = ox || 0; this.oy = oy || 0; this.rec = null; }
  Painter.prototype.rect = function (x, y, w, h, c) {
    if (w <= 0 || h <= 0 || !c) return;
    var r = this.rec;
    if (r) {
      if (x < r[0]) r[0] = x;
      if (y < r[1]) r[1] = y;
      if (x + w > r[2]) r[2] = x + w;
      if (y + h > r[3]) r[3] = y + h;
      return;
    }
    this.ctx.fillStyle = col(c);
    this.ctx.fillRect(x - this.ox, y - this.oy, w, h);
  };
  Painter.prototype.px = function (x, y, c) { this.rect(x, y, 1, 1, c); };
  Painter.prototype.poly = function (pts, c) {
    var n = pts.length, minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < n; i++) { if (pts[i][1] < minY) minY = pts[i][1]; if (pts[i][1] > maxY) maxY = pts[i][1]; }
    for (var y = Math.floor(minY); y < Math.ceil(maxY); y++) {
      var yc = y + 0.5, xs = [];
      for (i = 0; i < n; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        var x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
        if (x1 > x0) this.rect(x0, y, x1 - x0, 1, c);
      }
    }
  };
  Painter.prototype.ellipse = function (cx, cy, rx, ry, c) {
    for (var y = Math.floor(cy - ry); y < Math.ceil(cy + ry); y++) {
      var yc = (y + 0.5 - cy) / ry;
      if (Math.abs(yc) > 1) continue;
      var hw = rx * Math.sqrt(1 - yc * yc), x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      if (x1 > x0) this.rect(x0, y, x1 - x0, 1, c);
    }
  };
  Painter.prototype.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var guard = 0; guard < 2000; guard++) {
      this.rect(x0, y0, 1, 1, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  // Draw a vertical column run-length encoded from a colour function.
  Painter.prototype.column = function (x, ybot, h, fn, base) {
    var start = 0, cur = null;
    for (var v = 0; v <= h; v++) {
      var c = v < h ? (fn ? fn(v) : null) || base : null;
      if (c !== cur || v === h) {
        if (cur && v > start) this.rect(x, ybot - v, 1, v - start, cur);
        start = v; cur = c;
      }
    }
  };
  // Isometric box. Faces: top, left (+y side, facing lower-left) and right (+x side).
  // o.L / o.R are optional face shaders fn(u, v, len, h) returning a colour or null.
  Painter.prototype.box = function (x, y, z, w, d, h, o) {
    var a = P(x, y + d, z), c = P(x + w, y + d, z), b = P(x + w, y, z);
    var t0 = P(x, y, z + h), t1 = P(x + w, y, z + h), t2 = P(x + w, y + d, z + h), t3 = P(x, y + d, z + h);
    var self = this, u;
    if (o.ol) {
      var sil = [t0, t1, b, c, a, t3];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
        self.poly(sil.map(function (q) { return [q[0] + dd[0], q[1] + dd[1]]; }), o.ol);
      });
    }
    if (o.top) this.poly([t0, t1, t2, t3], o.top);
    if (o.inset && h > 0) {
      var e = o.insetE || 0.14;
      if (w > 2 * e && d > 2 * e) this.poly([P(x + e, y + e, z + h), P(x + w - e, y + e, z + h), P(x + w - e, y + d - e, z + h), P(x + e, y + d - e, z + h)], o.inset);
    }
    var lenL = c[0] - a[0], lenR = b[0] - c[0];
    for (u = 0; u < lenL; u++) {
      (function (uu) {
        var yb = a[1] + ((uu + 1) >> 1);
        self.column(a[0] + uu, yb, h, function (v) {
          if (o.rim && v === h - 1) return o.rimL || lt(o.left, 0.25);
          if (o.edge && uu === lenL - 1) return o.edge;
          return o.L ? o.L(uu, v, lenL, h) : null;
        }, o.left);
      })(u);
    }
    for (u = 0; u < lenR; u++) {
      (function (uu) {
        var yb = c[1] - (uu >> 1);
        self.column(c[0] + uu, yb, h, function (v) {
          if (o.rim && v === h - 1) return o.rimR || lt(o.right, 0.2);
          return o.R ? o.R(uu, v, lenR, h) : null;
        }, o.right);
      })(u);
    }
  };
  // Hip roof (hanok style when o.hanok). Ridge runs along the longer side.
  Painter.prototype.roof = function (x, y, z, w, d, hr, o) {
    var e = o.e == null ? 0.22 : o.e, along = w >= d, half = Math.min(w, d) / 2, k = o.hip == null ? 0.85 : o.hip;
    var A = P(x - e, y - e, z), B = P(x + w + e, y - e, z), C = P(x + w + e, y + d + e, z), D = P(x - e, y + d + e, z), R1, R2;
    if (along) { R1 = P(x + half * k, y + d / 2, z + hr); R2 = P(x + w - half * k, y + d / 2, z + hr); }
    else { R1 = P(x + w / 2, y + half * k, z + hr); R2 = P(x + w / 2, y + d - half * k, z + hr); }
    var front = o.front, side = o.side || dk(o.front, 0.25), back = o.back || lt(o.front, 0.15);
    if (o.ol) {
      var sil = along ? [A, B, C, D] : [A, B, C, D];
      var self = this;
      var hull = along ? [A, R1, R2, B, C, D] : [A, R1, B, C, R2, D];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
        self.poly(hull.map(function (q) { return [q[0] + dd[0], q[1] + dd[1]]; }), o.ol);
      });
      void sil;
    }
    if (along) {
      this.poly([A, B, R2, R1], back);
      this.poly([A, D, R1], back);
      this.poly([B, C, R2], side);
      this.poly([D, C, R2, R1], front);
      this.tileRows(D, C, R1, R2, o.rows || dk(front, 0.18));
    } else {
      this.poly([A, B, R1], back);
      this.poly([A, D, R2, R1], back);
      this.poly([D, C, R2], front);
      this.poly([B, C, R2, R1], side);
      this.tileRows(C, B, R2, R1, o.rows ? dk(o.rows, 0.1) : dk(side, 0.18));
    }
    this.line(R1[0], R1[1], R2[0], R2[1], o.ridge || '#e9e4da');
    this.line(R1[0], R1[1] + 1, R2[0], R2[1] + 1, dk(front, 0.35));
    if (o.hanok) {
      var tip = o.tip || '#2c313a';
      this.px(D[0] - 1, D[1] - 1, tip); this.px(D[0] - 2, D[1] - 2, tip);
      this.px(B[0] + 1, B[1] - 1, tip); this.px(B[0] + 2, B[1] - 2, tip);
      this.px(C[0], C[1] - 1, tip); this.px(C[0] + 1, C[1] - 1, tip);
      this.px(R1[0] - 1, R1[1] - 1, tip); this.px(R2[0] + 1, R2[1] - 1, tip);
    }
    this.line(D[0], D[1], C[0], C[1], o.eave || dk(front, 0.45));
    this.line(C[0], C[1], B[0], B[1], o.eave || dk(front, 0.45));
  };
  Painter.prototype.tileRows = function (E0, E1, R0, R1, c) {
    var n = Math.max(2, Math.floor(Math.abs(E0[1] - R0[1]) / 2));
    for (var i = 1; i < n; i++) {
      var t = i / n;
      this.line(E0[0] + (R0[0] - E0[0]) * t, E0[1] + (R0[1] - E0[1]) * t, E1[0] + (R1[0] - E1[0]) * t, E1[1] + (R1[1] - E1[1]) * t, c);
    }
  };
  // Pixel-art blob for tree crowns. pal = [highlight, light, mid, dark, rim]
  Painter.prototype.blob = function (cx, cy, rx, ry, pal, seed) {
    for (var dy = -Math.ceil(ry) - 1; dy <= Math.ceil(ry) + 1; dy++) {
      for (var dx = -Math.ceil(rx) - 1; dx <= Math.ceil(rx) + 1; dx++) {
        var e = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry), n = hash(cx + dx, cy + dy, seed);
        if (e + n * 0.35 > 1.12) continue;
        var l = (dx / rx) * 0.55 + (dy / ry) * 0.85, c;
        if (l < -0.55) c = pal[0]; else if (l < -0.05) c = pal[1]; else if (l < 0.45) c = pal[2]; else c = pal[3];
        if (e > 0.78 && l > 0.25) c = pal[4];
        if (n < 0.1 && l > -0.55) c = pal[Math.max(0, pal.indexOf(c) - 1)];
        this.rect(cx + dx, cy + dy, 1, 1, c);
      }
    }
  };

  // ---------------------------------------------------------------- palettes
  var OL = '#3a3442';           // outline
  var PAL = {
    green: ['#c4ea86', '#98d062', '#76b84c', '#579a3b', '#43792f'],
    green2: ['#b8e27c', '#8cc457', '#6aa944', '#4d8a35', '#3b6c2a'],
    yellow: ['#fff0a0', '#f9d350', '#ecb52f', '#cc9020', '#a26e18'],
    orange: ['#ffd08a', '#f6a443', '#e3832a', '#bf651f', '#94491a'],
    red: ['#ffb08a', '#f07a4c', '#d9573a', '#b23f2c', '#87301f'],
    pink: ['#fff3f8', '#fcd5e5', '#f6b2ce', '#e48fb1', '#bd6d8f'],
    pine: ['#8fc074', '#5f9a52', '#467e42', '#346534', '#264c29'],
    bare: ['#a58a6c', '#8c7055', '#76593f', '#5f4630', '#4b3726']
  };
  function treePal(kind, r) {
    if (kind === 'pine') return PAL.pine;
    if (SEASON === 'spring') return kind === 'cherry' || r() < 0.35 ? PAL.pink : pick(r, [PAL.green, PAL.green2]);
    if (SEASON === 'summer') return pick(r, [PAL.green, PAL.green2, PAL.green]);
    if (SEASON === 'autumn') return kind === 'ginkgo' ? PAL.yellow : pick(r, [PAL.red, PAL.orange, PAL.yellow, PAL.green2, PAL.orange, PAL.red]);
    return PAL.bare;
  }

  // ---------------------------------------------------------------- the map
  // Roads every 8 tiles in both directions (2 tiles wide). Every intersection inside the
  // strip sits at mid-depth, so the strip reads as a row of blocks and crossroads.
  // Road A runs along gx (gy in [8b+1, 8b+3)), road B along gy (gx in [8a+2, 8a+4)).
  // The Han River replaces road A for b = 0 and is 4 tiles wide (gy in [0, 4)).
  function mod(a, n) { return ((a % n) + n) % n; }
  function roadA(iy) { return mod(iy - 1, 8) < 2 && Math.floor((iy - 1) / 8) !== 0; }
  function roadB(ix) { return mod(ix - 2, 8) < 2; }
  function riverRow(iy) { return iy >= 0 && iy < 4; }
  var LAND = {};
  function fillT(x0, y0, x1, y1, ch) { for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) LAND[x + ',' + y] = ch; }
  function tAt(ix, iy) {
    if (riverRow(iy)) return 'w';
    if (roadA(iy) || roadB(ix)) return 'r';
    return LAND[ix + ',' + iy] || 'g';
  }
  function isRoad(ix, iy) { return tAt(ix, iy) === 'r'; }
  function isWater(t) { return t === 'w' || t === 'l'; }
  function uOf(gx, gy) { return gx - gy; }
  function vOf(gx, gy) { return gx + gy; }

  // Namsan: a terraced hill. Centre is set by the district builder.
  var NAM = { cx: 0, cy: 0, on: false };
  function hillH(ix, iy) {
    if (!NAM.on) return 0;
    var lx = ix - NAM.bx, ly = iy - NAM.by;
    if (lx < 0 || ly < 0 || lx > 5 || ly > 5) return 0;
    var dx = ix + 0.5 - NAM.cx, dy = iy + 0.5 - NAM.cy, dd = Math.sqrt(dx * dx * 0.9 + dy * dy * 0.9);
    var h = Math.max(0, 20 - dd * 6.5);
    return Math.round(h / 3) * 3;
  }

  // ---------------------------------------------------------------- ground raster
  var SW = 0.3;
  function sidewalk(gx, gy, ix, iy, fx, fy) {
    var d = 9;
    if (isRoad(ix - 1, iy)) d = Math.min(d, fx);
    if (isRoad(ix + 1, iy)) d = Math.min(d, 1 - fx);
    if (isRoad(ix, iy - 1)) d = Math.min(d, fy);
    if (isRoad(ix, iy + 1)) d = Math.min(d, 1 - fy);
    if (isRoad(ix - 1, iy - 1)) d = Math.min(d, Math.max(fx, fy));
    if (isRoad(ix + 1, iy - 1)) d = Math.min(d, Math.max(1 - fx, fy));
    if (isRoad(ix - 1, iy + 1)) d = Math.min(d, Math.max(fx, 1 - fy));
    if (isRoad(ix + 1, iy + 1)) d = Math.min(d, Math.max(1 - fx, 1 - fy));
    if (d >= SW) return null;
    if (d < 0.065) return '#bcaea4';
    return ((Math.floor(gx * 5) + Math.floor(gy * 5)) & 1) ? '#ece3d9' : '#e5dbcf';
  }
  function grassPx(sx, sy) {
    var n = hash(sx, sy, 3);
    if (WINTER) return n < 0.08 ? '#d5dfe8' : n > 0.985 ? '#c6d2dd' : '#eef3f7';
    var base = SEASON === 'autumn' ? '#93c763' : '#8fcc63';
    if (n < 0.05) return '#74b24e';
    if (n > 0.993) return SEASON === 'spring' ? '#fbe3ee' : SEASON === 'autumn' ? '#f2b04a' : '#f6f0a8';
    if (hash(sx, sy - 1, 3) < 0.05) return '#a6da77';
    return base;
  }
  function roadPx(gx, gy, ix, iy, fx, fy, sx, sy) {
    var line = '#f8f4f0', yel = '#f0bf47';
    var inX = roadA(iy), inY = roadB(ix);
    var b = hash(sx, sy, 5) < 0.04 ? '#c5bcb7' : '#cec6c2';
    if (inX && inY) return b;
    if (inX) {
      if ((roadB(ix + 1) && fx > 0.22 && fx < 0.8) || (roadB(ix - 1) && fx > 0.2 && fx < 0.78)) return (Math.floor(gy * 5) & 1) ? b : line;
      var c0 = Math.floor((iy - 1) / 8) * 8 + 2;
      if (Math.abs(gy - c0) < 0.07) return yel;
      if (Math.abs(gy - (c0 - 0.88)) < 0.05 || Math.abs(gy - (c0 + 0.88)) < 0.05) return (Math.floor(gx * 2) & 1) ? b : '#e6dfda';
      return b;
    }
    if (inY) {
      if ((roadA(iy + 1) && fy > 0.22 && fy < 0.8) || (roadA(iy - 1) && fy > 0.2 && fy < 0.78)) return (Math.floor(gx * 5) & 1) ? b : line;
      var c1 = Math.floor((ix - 2) / 8) * 8 + 3;
      if (Math.abs(gx - c1) < 0.07) return yel;
      if (Math.abs(gx - (c1 - 0.88)) < 0.05 || Math.abs(gx - (c1 + 0.88)) < 0.05) return (Math.floor(gy * 2) & 1) ? b : '#e6dfda';
      return b;
    }
    return b;
  }
  function landPx(t, gx, gy, ix, iy, sx, sy) {
    var fx = gx - ix, fy = gy - iy, n;
    if (t !== 'r') { var s = sidewalk(gx, gy, ix, iy, fx, fy); if (s) return s; }
    switch (t) {
      case 'r': return roadPx(gx, gy, ix, iy, fx, fy, sx, sy);
      case 'p':
        if (mod(gx * 2, 1) < 0.07 || mod(gy * 2, 1) < 0.07) return WINTER ? '#dfe3e6' : '#dcd2c3';
        return WINTER ? '#eef1f3' : '#e9e1d4';
      case 'd':
        n = hash(sx, sy, 8);
        return WINTER ? (n < 0.1 ? '#e2e8ec' : '#f1f4f6') : n < 0.07 ? '#ddcfb1' : n > 0.97 ? '#f4ecd8' : '#eadfc6';
      case 'q':
        n = hash(Math.floor(gx * 6), Math.floor(gy * 6), 4);
        if (mod(gx * 6, 1) < 0.12 || mod(gy * 6, 1) < 0.12) return '#cbc2b3';
        return WINTER ? '#eceff1' : n < 0.4 ? '#ddd5c7' : '#e4ddd0';
      case 'a':
        if (fy > 0.15 && fy < 0.5 && mod(gx * 3, 1) < 0.07) return '#f4f1ec';
        return hash(sx, sy, 6) < 0.04 ? '#bab2ad' : '#c4bcb7';
      case 'k':
        if (Math.abs(fy - 0.5) < 0.2) return Math.abs(fy - 0.5) < 0.03 && (Math.floor(gx * 3) & 1) ? '#f4efe8' : '#d58f78';
        return grassPx(sx, sy);
      default:
        return grassPx(sx, sy);
    }
  }
  function waterPx(t, gx, gy, sx, sy) {
    var lake = t === 'l';
    var base = lake ? '#6cb8dc' : '#5ea9d8';
    if (!lake && Math.min(gy, 4 - gy) < 0.2) base = '#6db4de';
    var s = hash(Math.floor(gx * 2 + (Math.floor(gy * 7) % 3) * 0.33), Math.floor(gy * 7), 11);
    if (s < 0.1) return lake ? '#86c9e6' : '#7cc0e6';
    if (s > 0.95) return lake ? '#5aaad2' : '#4f9ccc';
    return base;
  }
  function inStrip(gx, gy) { var v = gx + gy, u = gx - gy; return v >= 0 && u >= UMIN && u < UMAX; }
  function groundPx(sx, sy) {
    var q = inv(sx, sy), gx = q[0], gy = q[1];
    if (!inStrip(gx, gy)) return null;
    var ix = Math.floor(gx), iy = Math.floor(gy), t = tAt(ix, iy);
    if (!isWater(t)) return landPx(t, gx, gy, ix, iy, sx, sy);
    var D = t === 'w' ? RIVER_D : LAKE_D, q2 = inv(sx, sy - D);
    if (q2[0] + q2[1] < 0 || tAt(Math.floor(q2[0]), Math.floor(q2[1])) === t) return waterPx(t, q2[0], q2[1], sx, sy);
    var q3 = inv(sx, sy - D + 1);
    var bottom = tAt(Math.floor(q3[0]), Math.floor(q3[1])) === t;
    if (t === 'w') return bottom ? '#a89d90' : ((sy & 1) ? '#cbc1b5' : '#c3b8ab');
    return bottom ? '#8f877b' : '#a9a195';
  }
  var waterPixels = [];
  function buildGround() {
    var cv = mk(GW, H), g = cv.getContext('2d'), img = g.createImageData(GW, H), Dt = img.data, cache = {};
    waterPixels = [];
    for (var sy = OY; sy < H; sy++) {
      for (var sx = 0; sx < GW; sx++) {
        var c = groundPx(sx, sy);
        if (!c) continue;
        var v = cache[c] || (cache[c] = rgbOf(col(c))), i = (sy * GW + sx) * 4;
        Dt[i] = v[0]; Dt[i + 1] = v[1]; Dt[i + 2] = v[2]; Dt[i + 3] = 255;
        if (c === '#5ea9d8' || c === '#6cb8dc') waterPixels.push(sx, sy);
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // ---------------------------------------------------------------- static objects
  var statics = [], lamps = [], labels = [];
  function S(x0, y0, x1, y1, z0, top, draw, label) {
    var s = { x0: x0, y0: y0, x1: x1, y1: y1, z0: z0, top: top, draw: draw, label: label || null };
    statics.push(s);
    return s;
  }

  // face shaders -------------------------------------------------------------
  function winGrid(o) {
    var seed = o.seed || 1, litp = o.litp == null ? 0.42 : o.litp;
    return function (u, v, len, h) {
      var base = o.base == null ? 2 : o.base, top = o.top == null ? 2 : o.top;
      if (v < base || v >= h - top) return null;
      var uu = u - (o.uoff == null ? 2 : o.uoff);
      if (uu < 0 || u >= len - (o.uend == null ? 1 : o.uend)) return null;
      var fv = v - base, row = Math.floor(fv / o.fh), rv = fv % o.fh;
      if (rv < 1 || rv > o.wh) return null;
      var c = Math.floor(uu / o.wp), cu = uu % o.wp;
      if (cu >= o.ww) return null;
      if (NIGHT) return hash(c * 13 + (o.side || 0), row, seed) < litp ? '!' + (o.lit || '#ffd98a') : (o.glassN || o.glass);
      return rv === o.wh ? (o.hi || lt(o.glass, 0.35)) : o.glass;
    };
  }
  function curtain(o) {
    var seed = o.seed || 1;
    return function (u, v, len, h) {
      if (v < (o.base || 0) || v >= h - 1) return null;
      var vv = v - (o.base || 0), mull = u % o.mw === 0 || vv % o.fh === 0;
      if (NIGHT) {
        if (mull) return o.mullN || null;
        return hash(Math.floor(u / o.mw) + (o.side || 0) * 50, Math.floor(vv / o.fh), seed) < (o.litp || 0.4) ? '!' + (o.lit || '#ffe2a0') : null;
      }
      if (mull) return o.mull;
      if (((u * 2 + (h - v) + seed * 7) % 41) < 6) return o.hi;
      return null;
    };
  }
  function both(f1, f2) { return function (u, v, len, h) { return f1(u, v, len, h) || f2(u, v, len, h); }; }
  var FONT = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'] };
  function textFn(str, u0, vtop, color) {
    return function (u, v) {
      var row = vtop - v;
      if (row < 0 || row > 4) return null;
      var k = u - u0;
      if (k < 0) return null;
      var ci = Math.floor(k / 4), cu = k % 4;
      if (ci >= str.length || cu > 2) return null;
      return FONT[str[ci]][row][cu] === '1' ? color : null;
    };
  }
  function roofSnow(c) { return WINTER ? '#f3f6f9' : c; }

  // building -----------------------------------------------------------------
  var STY = {
    teal: { top: '#d5e9ea', left: '#86c3cf', right: '#5f97ab', glass: '#86c3cf', mull: '#d8eef2', hi: '#bfe6ee', mw: 3, fh: 4 },
    blue: { top: '#d2dbea', left: '#7f9fcd', right: '#5d79a8', mull: '#c8d6ee', hi: '#b3c8ea', mw: 4, fh: 4 },
    dark: { top: '#aab4c4', left: '#55667f', right: '#414f66', mull: '#7d8ea8', hi: '#7e93b2', mw: 3, fh: 3 },
    gold: { top: '#f8de91', left: '#e9b847', right: '#c78f2b', mull: '#f6d77c', hi: '#fde7a8', mw: 2, fh: 3 },
    silver: { top: '#e3ebf1', left: '#c3d3df', right: '#98adbf', mull: '#e4edf3', hi: '#eef5f9', mw: 2, fh: 5 }
  };
  function glassTower(x, y, w, d, h, sty, seed, label, extra) {
    var s = STY[sty];
    return S(x, y, x + w, y + d, 0, h, function (p) {
      p.box(x, y, 0, w, d, h, {
        top: roofSnow(s.top), left: s.left, right: s.right, ol: OL, rim: true, inset: dk(s.top, 0.12),
        L: curtain({ mw: s.mw, fh: s.fh, mull: s.mull, hi: s.hi, seed: seed, side: 0, base: 3 }),
        R: curtain({ mw: s.mw, fh: s.fh, mull: dk(s.mull, 0.15), hi: dk(s.hi, 0.12), seed: seed, side: 1, base: 3 })
      });
      if (extra) extra(p);
    }, label);
  }
  function officeBlock(x, y, w, d, h, wall, seed, label, extra) {
    var left = wall, right = dk(wall, 0.18), glass = '#7f9fb8';
    return S(x, y, x + w, y + d, 0, h, function (p) {
      p.box(x, y, 0, w, d, h, {
        top: roofSnow(lt(wall, 0.25)), left: left, right: right, ol: OL, rim: true, inset: dk(lt(wall, 0.25), 0.1),
        L: winGrid({ fh: 4, wh: 2, ww: 2, wp: 4, glass: glass, seed: seed, side: 0 }),
        R: winGrid({ fh: 4, wh: 2, ww: 2, wp: 4, glass: dk(glass, 0.15), seed: seed, side: 1 })
      });
      if (extra) extra(p);
    }, label);
  }
  function rooftop(p, x, y, z, r) {
    var n = 1 + Math.floor(r() * 2);
    for (var i = 0; i < n; i++) {
      var bx = x + r() * 0.5, by = y + r() * 0.5;
      if (r() < 0.3) { var c = P(bx + 0.15, by + 0.15, z); p.rect(c[0] - 2, c[1] - 4, 4, 4, '#9fb3c4'); p.rect(c[0], c[1] - 4, 2, 4, '#8297aa'); p.rect(c[0] - 2, c[1] - 5, 4, 1, '#c3d2de'); continue; }
      p.box(bx, by, z, 0.24, 0.2, 2, { top: '#ece9e4', left: '#d0ccc6', right: '#aaa59e' });
      var g = P(bx + 0.12, by + 0.2, z + 1); p.px(g[0], g[1], '#8d8882');
    }
  }
  // Shop with storefront, awning and Korean-style signboards.
  function shop(x, y, w, d, h, o) {
    var seed = o.seed || 3, wall = o.wall;
    return S(x, y, x + w, y + d, 0, h, function (p) {
      var r = rng(seed);
      var store = function (u, v, len) {
        if (v < 5) {
          if (u === 0 || u >= len - 1) return null;
          if (u % 6 === 0 || v === 0) return '#5b4b45';
          if (NIGHT) return '!#ffe7b0';
          return v === 4 ? '#c6e2ea' : '#9cc7d6';
        }
        if (v === 5 || v === 6) return (Math.floor(u / 2) & 1) ? o.awn : (v === 5 ? '#ffffff' : lt(o.awn, 0.4));
        if (o.sign && v >= h - 6 && v <= h - 2 && u >= 2 && u < len - 2) {
          if (v === h - 2 || v === h - 6 || u === 2 || u === len - 3) return dk(o.sign, 0.2);
          if (hash(u, v, seed) < 0.4 && v > h - 6 && v < h - 2) return NIGHT ? '!#ffffff' : '#ffffff';
          return NIGHT ? '!' + o.sign : o.sign;
        }
        return null;
      };
      var upper = winGrid({ fh: 4, wh: 2, ww: 2, wp: 4, base: 8, top: o.sign ? 7 : 2, glass: '#86a6bd', seed: seed });
      var vsign = function (u, v, len, hh) {
        if (o.vsign && u >= 2 && u <= 3 && v >= 8 && v < hh - 2) {
          if (u === 3 && (v & 1)) return NIGHT ? '!#ffffff' : '#ffffff';
          return NIGHT ? '!' + o.vsign : o.vsign;
        }
        return null;
      };
      p.box(x, y, 0, w, d, h, {
        top: roofSnow(o.roof || lt(wall, 0.3)), left: wall, right: dk(wall, 0.2), ol: OL, rim: true, inset: dk(o.roof || lt(wall, 0.3), 0.1),
        L: both(store, upper),
        R: both(vsign, winGrid({ fh: 4, wh: 2, ww: 2, wp: 4, base: 3, glass: '#6f90a8', seed: seed + 1, side: 1 }))
      });
      rooftop(p, x + 0.2, y + 0.2, h, r);
    }, o.label);
  }
  // Korean apartment slab ("APT") with balconies and a painted block number.
  function apartment(x, y, w, d, h, num, stripe, seed) {
    return S(x, y, x + w, y + d, 0, h, function (p) {
      var balc = function (u, v, len) {
        if (v < 3 || v >= h - 2) return null;
        var fv = (v - 3) % 3, fl = Math.floor((v - 3) / 3), unit = Math.floor(u / 5);
        if (u % 5 === 0) return '#e3e0da';
        if (fv === 0) return '#f7f5f1';
        if (NIGHT) return hash(unit, fl, seed) < 0.5 ? '!#ffd38a' : '#9fb6c6';
        var k = hash(unit, fl, seed + 9);
        if (fv === 1 && k < 0.12) return pick(rng(unit * 31 + fl), ['#e9798a', '#7fbf6a', '#f2c14e', '#86b3e6']);
        return fv === 2 ? '#d5e3ec' : '#b8cdd9';
      };
      var end = function (u, v, len) {
        var t = textFn(num, Math.max(0, Math.floor((len - 11) / 2)), h - 4, NIGHT ? '!#e8f0ff' : '#5b6c86')(u, v);
        if (t) return t;
        if (u >= len - 3 && v > 3 && v < h - 10) return stripe;
        return null;
      };
      p.box(x, y, 0, w, d, h, { top: roofSnow('#ece9e4'), left: '#f1eee9', right: '#d9d5cf', ol: OL, rim: true, inset: '#dcd8d1', L: end, R: balc });
      p.box(x + w * 0.3, y + d * 0.4, h, w * 0.4, 0.5, 3, { top: '#d9d4cd', left: '#cbc5bd', right: '#aea79e' });
    }, 'Apartment complex');
  }
  // Hanok (traditional house): stone base, timber-framed white walls, curved tile roof.
  function hanok(x, y, w, d, seed, label) {
    return S(x - 0.25, y - 0.25, x + w + 0.25, y + d + 0.25, 0, 12, function (p) {
      p.box(x, y, 0, w, d, 2, { top: '#cfc8bb', left: '#bcb4a6', right: '#a39b8e', ol: OL });
      var frame = function (u, v, len, hh) {
        if (v === hh - 1 || u % 7 === 0) return '#7b4b2d';
        if (v < hh - 1 && u % 7 >= 2 && u % 7 <= 4 && v < hh - 2) return NIGHT ? '!#ffd99a' : ((u + v) & 1 ? '#c99a63' : '#b5844f');
        return null;
      };
      p.box(x + 0.15, y + 0.15, 2, w - 0.3, d - 0.3, 6, { top: '#f3eee4', left: '#f4efe5', right: '#d9d2c4', ol: OL, L: frame, R: frame });
      p.roof(x + 0.12, y + 0.12, 8, w - 0.24, d - 0.24, 6, { front: roofSnow('#76838f'), side: roofSnow('#5e6a77'), back: roofSnow('#93a0ab'), rows: '#66727e', ridge: '#f3efe8', hanok: true, ol: OL, e: 0.2, hip: 0.62 });
    }, label || 'Bukchon-style hanok');
  }
  function stoneWall(x, y, w, d, h) {
    return S(x, y, x + w, y + d, 0, h + 1, function (p) {
      p.box(x, y, 0, w, d, h, { top: '#5f6b78', left: '#d9c9b0', right: '#bfae94', ol: OL, L: function (u, v) { return v < 2 ? '#a99c8a' : null; }, R: function (u, v) { return v < 2 ? '#93877a' : null; } });
    });
  }
  // Trees ------------------------------------------------------------------------
  function tree(x, y, z, kind, seed) {
    var big = kind === 'ginkgo' ? 1.15 : 1;
    return S(x - 0.15, y - 0.15, x + 0.15, y + 0.15, z || 0, (z || 0) + 14, function (p) {
      var r = rng(seed), b = P(x, y, z || 0), pal = treePal(kind, r);
      p.ellipse(b[0] + 1, b[1], 4, 1.6, 'rgba(30,50,25,0.2)');
      if (kind === 'pine') {
        p.rect(b[0], b[1] - 3, 1, 3, '#6b4a33');
        for (var k = 0; k < 3; k++) p.blob(b[0], b[1] - 5 - k * 3, 4 - k, 2.2, PAL.pine, seed + k);
        if (WINTER) { p.rect(b[0] - 1, b[1] - 12, 2, 1, '#f5f8fb'); p.rect(b[0] - 3, b[1] - 6, 2, 1, '#f5f8fb'); }
        return;
      }
      p.rect(b[0] - 1, b[1] - 4, 2, 4, '#7a5236');
      p.rect(b[0], b[1] - 4, 1, 4, '#5e3f29');
      if (WINTER) {
        p.line(b[0], b[1] - 4, b[0] - 3, b[1] - 9, '#6e5440'); p.line(b[0], b[1] - 5, b[0] + 3, b[1] - 10, '#6e5440');
        p.line(b[0], b[1] - 4, b[0], b[1] - 11, '#6e5440'); p.px(b[0] - 3, b[1] - 10, '#f5f8fb'); p.px(b[0] + 3, b[1] - 11, '#f5f8fb'); p.px(b[0], b[1] - 12, '#f5f8fb');
        return;
      }
      if (kind === 'ginkgo') p.blob(b[0], b[1] - 9, 3.2 * big, 5.2, pal, seed);
      else p.blob(b[0], b[1] - 8, 4.4, 3.8, pal, seed);
    });
  }
  function lamp(x, y) {
    lamps.push([x, y]);
    return S(x - 0.05, y - 0.05, x + 0.05, y + 0.05, 0, 10, function (p) {
      var b = P(x, y, 0);
      p.rect(b[0], b[1] - 9, 1, 9, '#4d505a');
      p.rect(b[0] - 1, b[1] - 10, 3, 1, '#4d505a');
      p.rect(b[0] - 1, b[1] - 9, 2, 1, NIGHT ? '!#fff0b8' : '#f3eed8');
    });
  }
  function bench(x, y) {
    return S(x - 0.2, y - 0.08, x + 0.2, y + 0.08, 0, 2, function (p) {
      p.box(x - 0.2, y - 0.08, 0, 0.4, 0.16, 2, { top: '#a8744a', left: '#8d5f3b', right: '#73492c' });
    });
  }

  // ---------------------------------------------------------------- landmarks
  // N Seoul Tower on Namsan
  var TOWER_SHAFT = 24, TOWER_MAST = 14;
  function seoulTower(x, y, z) {
    return S(x - 0.45, y - 0.45, x + 0.45, y + 0.45, z, z + 90, function (p) {
      p.box(x - 0.45, y - 0.45, z, 0.9, 0.9, 6, {
        top: '#ebe6de', left: '#ddd6cb', right: '#c0b8ab', ol: OL, rim: true,
        L: winGrid({ fh: 3, wh: 1, ww: 2, wp: 3, base: 1, top: 1, glass: '#7fa3bd', seed: 4 }),
        R: winGrid({ fh: 3, wh: 1, ww: 2, wp: 3, base: 1, top: 1, glass: '#6a8ca6', seed: 5 })
      });
      var b = P(x, y, z + 6), cx = b[0], by = b[1], top = by - TOWER_SHAFT, yy;
      for (yy = by; yy > top; yy--) {
        p.rect(cx - 3, yy, 1, 1, OL); p.rect(cx + 3, yy, 1, 1, OL);
        p.rect(cx - 2, yy, 2, 1, '#f6f4f0'); p.rect(cx, yy, 1, 1, '#ddd8d0'); p.rect(cx + 1, yy, 2, 1, '#c4bdb3');
      }
      // observation decks
      p.ellipse(cx + 0.5, top - 1, 8, 4, OL);
      p.ellipse(cx + 0.5, top - 1, 7, 3.4, '#cfc9c0');
      p.rect(cx - 6, top - 6, 14, 5, OL);
      p.rect(cx - 6, top - 5, 6, 4, NIGHT ? '!#ffe3a3' : '#9bbbd2');
      p.rect(cx, top - 5, 7, 4, NIGHT ? '!#ffd27a' : '#7d9fba');
      p.rect(cx - 6, top - 3, 13, 1, NIGHT ? '!#fff4d6' : '#dfe9f0');
      p.ellipse(cx + 0.5, top - 6, 7.5, 3.2, OL);
      p.ellipse(cx + 0.5, top - 6, 6.6, 2.7, '#f4f1ec');
      p.rect(cx - 4, top - 11, 10, 5, OL);
      p.rect(cx - 3, top - 10, 4, 4, '#ece8e2'); p.rect(cx + 1, top - 10, 4, 4, '#cfc8be');
      p.ellipse(cx + 0.5, top - 11, 5, 2, '#f7f4ef');
      // mast with red and white bands
      for (yy = top - 12; yy > top - 12 - TOWER_MAST; yy--) {
        var band = Math.floor((top - 12 - yy) / 3) & 1;
        p.rect(cx - 1, yy, 1, 1, OL); p.rect(cx + 2, yy, 1, 1, OL);
        p.rect(cx, yy, 2, 1, band ? '#e9eef2' : '#d9483b');
      }
      p.rect(cx, top - 16 - TOWER_MAST, 1, 4, '#9aa3ad');
    }, 'N Seoul Tower, Namsan');
  }

  // Lotte World Tower: a tapering silver tower with a split crown.
  function lotteTower(x, y) {
    var w = 2, h = 68, step = 4;
    return S(x, y, x + w, y + w, 0, h, function (p) {
      var slices = [];
      for (var z = 0; z < h; z += step) {
        var t = z / h, ins = 0.1 + t * 0.34 + t * t * 0.4;
        slices.push([x + ins, y + ins, z, w - 2 * ins, Math.min(step, h - z)]);
      }
      slices.forEach(function (s) { p.box(s[0], s[1], s[2], s[3], s[3], s[4], { left: OL, right: OL, top: OL, ol: OL }); });
      slices.forEach(function (s, i) {
        var lit = NIGHT ? (i % 6 === 0 ? '!#f4f8ff' : null) : null;
        p.box(s[0], s[1], s[2], s[3], s[3], s[4], {
          top: '#e9f0f5', left: '#c6d6e3', right: '#97adc0',
          L: function (u, v) { if (lit && v === 0) return lit; if (NIGHT) return hash(u >> 1, i, 31) < 0.3 ? '!#ffe7b3' : null; return u % 3 === 1 ? '#e2ecf3' : ((u + i) % 11 === 0 ? '#eef5fa' : null); },
          R: function (u, v) { if (lit && v === 0) return lit; if (NIGHT) return hash(u >> 1, i, 37) < 0.25 ? '!#ffd998' : null; return u % 3 === 1 ? '#b3c6d6' : null; }
        });
      });
      var c = P(x + w / 2, y + w / 2, h);
      p.line(c[0] - 3, c[1] + 2, c[0] - 2, c[1] - 12, OL); p.line(c[0] + 3, c[1] + 2, c[0] + 2, c[1] - 12, OL);
      p.line(c[0] - 2, c[1] + 2, c[0] - 1, c[1] - 11, NIGHT ? '!#fff6d8' : '#dce7ef');
      p.line(c[0] + 2, c[1] + 2, c[0] + 1, c[1] - 11, NIGHT ? '!#fff6d8' : '#b8cad8');
      p.line(c[0] - 2, c[1] - 4, c[0] + 2, c[1] - 4, '#c6d6e3');
    }, 'Lotte World Tower');
  }

  // Gyeongbokgung: main hall on a stone platform, with Gwanghwamun gate in front.
  function palaceHall(x, y, w, d) {
    return S(x - 0.3, y - 0.3, x + w + 0.3, y + d + 0.3, 0, 24, function (p) {
      p.box(x - 0.3, y - 0.3, 0, w + 0.6, d + 0.6, 2, { top: '#ded6c8', left: '#cbc2b2', right: '#b1a797', ol: OL });
      p.box(x - 0.1, y - 0.1, 2, w + 0.2, d + 0.2, 2, { top: '#e6dfd2', left: '#d2c9b9', right: '#b8ae9f', ol: OL });
      var cols = function (u, v, len, hh) {
        if (v >= hh - 2) return (u & 1) ? '#3f8f7d' : '#2f6f62';
        if (u % 5 === 0) return '#b5432f';
        if (NIGHT) return '!#ffc977';
        return v < hh - 3 && (u + v) & 1 ? '#c99a63' : '#a8784a';
      };
      p.box(x + 0.25, y + 0.25, 4, w - 0.5, d - 0.5, 6, { top: '#b5432f', left: '#c4553d', right: '#9e3a28', ol: OL, L: cols, R: cols });
      p.roof(x, y, 10, w, d, 4, { front: roofSnow('#56616e'), side: roofSnow('#434d59'), back: roofSnow('#6c7884'), hanok: true, ol: OL, e: 0.35, hip: 0.55 });
      p.box(x + 0.45, y + 0.45, 12, w - 0.9, d - 0.9, 3, { top: '#b5432f', left: '#3f8f7d', right: '#2f6f62', ol: OL });
      p.roof(x + 0.25, y + 0.25, 15, w - 0.5, d - 0.5, 6, { front: roofSnow('#5b6774'), side: roofSnow('#46505c'), back: roofSnow('#717d89'), hanok: true, ol: OL, e: 0.3, hip: 0.6 });
    }, 'Gyeongbokgung Palace');
  }
  function gwanghwamun(x, y, w, d) {
    return S(x, y, x + w, y + d, 0, 22, function (p) {
      var arches = function (u, v, len) {
        for (var k = 1; k <= 3; k++) {
          var uc = Math.round(len * k / 4), du = Math.abs(u - uc);
          if ((v < 4 && du <= 1) || (v === 4 && du === 0)) return '#3a332e';
        }
        if (v === 7) return '#c9bda9';
        return ((u >> 2) + (v >> 1)) & 1 ? '#e5dccb' : null;
      };
      p.box(x, y, 0, w, d, 8, { top: '#e0d6c4', left: '#dad0bd', right: '#bfb39f', ol: OL, L: arches });
      p.box(x + 0.25, y + 0.15, 8, w - 0.5, d - 0.3, 3, { top: '#b5432f', left: '#b5432f', right: '#8f3424', ol: OL, L: function (u) { return u % 4 === 0 ? '#3f8f7d' : null; } });
      p.roof(x + 0.1, y + 0.05, 11, w - 0.2, d - 0.1, 3, { front: roofSnow('#56616e'), side: roofSnow('#434d59'), back: roofSnow('#6c7884'), hanok: true, ol: OL, e: 0.3, hip: 0.5 });
      p.box(x + 0.45, y + 0.2, 13, w - 0.9, d - 0.4, 2, { top: '#b5432f', left: '#3f8f7d', right: '#2f6f62', ol: OL });
      p.roof(x + 0.3, y + 0.12, 15, w - 0.6, d - 0.24, 5, { front: roofSnow('#5b6774'), side: roofSnow('#46505c'), back: roofSnow('#717d89'), hanok: true, ol: OL, e: 0.25, hip: 0.55 });
    }, 'Gwanghwamun Gate');
  }
  function sejongStatue(x, y) {
    return S(x - 0.25, y - 0.2, x + 0.25, y + 0.2, 0, 12, function (p) {
      p.box(x - 0.25, y - 0.2, 0, 0.5, 0.4, 4, { top: '#e8e2d6', left: '#d6cfc1', right: '#b9b1a3', ol: OL });
      var b = P(x, y, 4);
      p.rect(b[0] - 3, b[1] - 3, 7, 3, OL); p.rect(b[0] - 2, b[1] - 9, 5, 7, OL);
      p.rect(b[0] - 2, b[1] - 3, 5, 2, '#d9a93e'); p.rect(b[0] - 1, b[1] - 8, 3, 5, '#e8bc4f');
      p.rect(b[0] + 1, b[1] - 8, 1, 5, '#c9952f'); p.rect(b[0] - 1, b[1] - 9, 2, 1, '#f3d27a');
    }, 'Statue of King Sejong');
  }
  // Jeongja (pavilion) on the pond island
  function pavilion(x, y) {
    return S(x - 0.4, y - 0.4, x + 0.4, y + 0.4, 0, 14, function (p) {
      p.box(x - 0.35, y - 0.35, 0, 0.7, 0.7, 2, { top: '#d8cfbf', left: '#c3b9a8', right: '#a99f8f', ol: OL });
      [[-0.3, -0.3], [0.25, -0.3], [-0.3, 0.25], [0.25, 0.25]].forEach(function (q) {
        p.box(x + q[0], y + q[1], 2, 0.06, 0.06, 5, { top: '#b5432f', left: '#b5432f', right: '#8f3424' });
      });
      p.roof(x - 0.35, y - 0.35, 7, 0.7, 0.7, 5, { front: roofSnow('#5d6976'), side: roofSnow('#485360'), back: roofSnow('#717d89'), hanok: true, ol: OL, e: 0.25, hip: 0.95 });
    }, 'Pavilion on the palace pond');
  }

  // Bridges and the Line 2 viaduct ---------------------------------------------
  // Road bridge over the river for the road-B column starting at gx = bx.
  function roadBridgeTile(bx, gy) {
    return S(bx, gy, bx + 2, gy + 1, -2, 0, function (p) {
      if (gy === 0 || gy === 2) {
        p.box(bx + 0.6, gy + 0.35, -RIVER_D, 0.8, 0.3, RIVER_D - 2, { top: '#bdb4aa', left: '#b1a89d', right: '#958c82', ol: OL });
      }
      p.box(bx, gy, -2, 2, 1, 2, {
        top: '#cec6c2', left: '#c2b9b3', right: '#a8a09a',
        L: function (u, v) { return v === 1 ? '#8d857f' : null; },
        R: function (u, v) { return v === 1 ? (NIGHT ? (u % 4 === 0 ? '!' + ['#ff6b6b', '#ffd36b', '#6bff9c', '#6bc8ff', '#c46bff'][(u >> 2) % 5] : null) : '#8d857f') : null; }
      });
      var a = P(bx + 1, gy, 0), b = P(bx + 1, gy + 1, 0);
      p.line(a[0], a[1], b[0], b[1], '#f0bf47');
      var s0 = P(bx + 0.12, gy, 0), s1 = P(bx + 0.12, gy + 1, 0);
      p.line(s0[0], s0[1], s1[0], s1[1], '#e6ddd3');
      var r0 = P(bx, gy, 2), r1 = P(bx, gy + 1, 2);
      p.line(r0[0], r0[1], r1[0], r1[1], '#7d8590');
      for (var k = 0; k <= 2; k++) { var q = P(bx, gy + k / 2, 0); p.rect(q[0], q[1] - 2, 1, 2, '#7d8590'); }
    }, bx === 2 ? 'Banpo Bridge' : 'Han River bridge');
  }
  function roadBridgeRail(bx, gy) {
    return S(bx + 1.95, gy, bx + 2, gy + 1, 0, 2, function (p) {
      var r0 = P(bx + 2, gy, 2), r1 = P(bx + 2, gy + 1, 2);
      p.line(r0[0], r0[1], r1[0], r1[1], '#7d8590');
      for (var k = 0; k <= 2; k++) { var q = P(bx + 2, gy + k / 2, 0); p.rect(q[0], q[1] - 2, 1, 2, '#7d8590'); }
    }, bx === 2 ? 'Banpo Bridge' : 'Han River bridge');
  }
  var VZ = 9;   // viaduct deck height
  var RAILX = 6; // the Line 2 viaduct runs along gy at gx in [RAILX, RAILX + 1)
  function viaductTile(gy) {
    var x = RAILX, water = riverRow(gy);
    return S(x, gy, x + 1, gy + 1, VZ - 2, VZ, function (p) {
      if (water && (gy === 0 || gy === 2)) p.box(x + 0.3, gy + 0.3, -RIVER_D, 0.4, 0.4, RIVER_D + VZ - 2, { top: '#cfc9c1', left: '#c4bdb4', right: '#a59d93', ol: OL });
      else if (!water && !isRoad(x, gy) && mod(gy, 2) === 0) p.box(x + 0.32, gy + 0.32, 0, 0.36, 0.36, VZ - 2, { top: '#d8d2ca', left: '#cdc6bc', right: '#ada59b', ol: OL });
      p.box(x + 0.05, gy, VZ - 2, 0.9, 1, 2, { top: '#d9d3cb', left: '#cbc4ba', right: '#aaa298', L: function (u, v) { return v === 0 ? '#9c948a' : null; }, R: function (u, v) { return v === 0 ? '#8e867c' : null; } });
      [x + 0.33, x + 0.67].forEach(function (rx) { var a = P(rx, gy, VZ), b = P(rx, gy + 1, VZ); p.line(a[0], a[1], b[0], b[1], '#8a8580'); });
    }, 'Seoul Metro Line 2');
  }
  function railTruss(xs, front) {
    return S(xs, 0, xs + 0.1, 4, VZ, VZ + 9, function (p) {
      var c = front ? '#4f7fb3' : '#3f6896';
      var prev = null, i, gy, k;
      for (i = 0; i <= 16; i++) {
        gy = i / 4; k = Math.sin(Math.PI * (i % 8) / 8);
        var top = P(xs, gy, VZ + 2 + Math.round(k * 7)), bot = P(xs, gy, VZ);
        if (prev) p.line(prev[0], prev[1], top[0], top[1], OL);
        if (i % 2 === 0) p.line(top[0], top[1], bot[0], bot[1], c);
        prev = top;
      }
      prev = null;
      for (i = 0; i <= 16; i++) {
        gy = i / 4; k = Math.sin(Math.PI * (i % 8) / 8);
        var t = P(xs, gy, VZ + 2 + Math.round(k * 7)); t[1] += 1;
        if (prev) p.line(prev[0], prev[1], t[0], t[1], c);
        prev = t;
      }
    }, 'Dangsan Railway Bridge');
  }
  function station(y0, y1) {
    var x = RAILX;
    [[x - 0.28, x + 0.05], [x + 0.95, x + 1.28]].forEach(function (xx, i) {
      S(xx[0], y0, xx[1], y1, VZ - 2, VZ + 8, function (p) {
        p.box(xx[0], y0, VZ - 2, xx[1] - xx[0], y1 - y0, 2, { top: '#e8e2d8', left: '#d2cabe', right: '#b5ad9f', ol: OL });
        p.box(xx[0], y0 + 0.3, VZ, 0.05, 0.05, 6, { top: '#5d6670', left: '#5d6670', right: '#4a525b' });
        p.box(xx[0], y1 - 0.35, VZ, 0.05, 0.05, 6, { top: '#5d6670', left: '#5d6670', right: '#4a525b' });
        p.box(xx[0] - (i ? 0 : 0.05), y0 + 0.1, VZ + 6, xx[1] - xx[0] + 0.05, y1 - y0 - 0.2, 1, { top: roofSnow('#3fae5a'), left: '#36984e', right: '#2c7f41', ol: OL });
        if (i === 1) {
          var b = P(xx[1], (y0 + y1) / 2, VZ + 3);
          p.ellipse(b[0] + 2.5, b[1], 3, 3, OL); p.ellipse(b[0] + 2.5, b[1], 2.4, 2.4, '!#3fb05a');
          p.rect(b[0] + 2, b[1] - 1, 1, 3, '#ffffff'); p.px(b[0] + 3, b[1] - 1, '#ffffff');
        }
      }, 'Seoul Metro Line 2 station');
    });
  }
  function cableStation(x, y, z, w, d) {
    return S(x, y, x + w, y + d, z, z + 7, function (p) {
      p.box(x, y, z, w, d, 6, { top: roofSnow('#e9e3d9'), left: '#efe7da', right: '#cfc5b6', ol: OL, rim: true, L: winGrid({ fh: 6, wh: 3, ww: 3, wp: 5, base: 1, glass: '#85a7bf', seed: 2 }) });
    }, 'Namsan Cable Car');
  }

  // ---------------------------------------------------------------- build the city
  // Blocks are 6x6 tiles. The row of blocks at mid-depth (a + b = -1) holds the
  // districts; the thin triangles above and below the crossroads (a + b = -2 and 0)
  // get skyline fillers and small front lots.
  var footprints = [];
  function blockOrigin(a, b) { return [8 * a + 4, 8 * b + 3]; }
  function fits(x, y, w, d) {
    if (x + y < 0.1) return false;
    if (x - y - d < UMIN + 1 || x + w - y > UMAX - 1) return false;
    if (x < RAILX + 1.3 && x + w > RAILX - 0.3 && y + d > -8 && y < 6) return false;
    var pts = [[x + 0.01, y + 0.01], [x + w - 0.01, y + 0.01], [x + 0.01, y + d - 0.01], [x + w - 0.01, y + d - 0.01], [x + w / 2, y + d / 2]];
    for (var i = 0; i < pts.length; i++) {
      var t = tAt(Math.floor(pts[i][0]), Math.floor(pts[i][1]));
      if (t === 'r' || isWater(t)) return false;
    }
    for (i = 0; i < footprints.length; i++) {
      var f = footprints[i];
      if (x < f[2] && f[0] < x + w && y < f[3] && f[1] < y + d) return false;
    }
    return true;
  }
  function claim(x, y, w, d) { footprints.push([x, y, x + w, y + d]); }
  function inUView(x, y) { var u = x - y; return u > UMIN + 0.5 && u < UMAX - 0.5 && x + y >= 0.05; }
  function treeAt(x, y, kind, seed, z) { if (inUView(x, y) && fits(x - 0.15, y - 0.15, 0.3, 0.3)) { tree(x, y, z || 0, kind, seed); claim(x - 0.15, y - 0.15, 0.3, 0.3); } }

  var STYLES = ['teal', 'blue', 'dark', 'silver'];
  var WALLS = ['#e9dcc4', '#f1f0ec', '#dbe3ea', '#e6ddd0', '#d9c6b0', '#efe2cf'];
  var SHOPS = [
    { wall: '#efe2cf', awn: '#7a5236', sign: '#7a5236', label: 'Cafe' },
    { wall: '#f6f6f3', awn: '#3aa0d8', sign: '#2f7fd0', label: 'Convenience store' },
    { wall: '#f0d9c0', awn: '#d9483b', sign: '#e8573f', vsign: '#f2b233', label: 'Chicken and beer' },
    { wall: '#e0d4f0', awn: '#8a5bd6', sign: '#8a5bd6', vsign: '#ff5aa5', label: 'Noraebang (karaoke)' },
    { wall: '#f6ead8', awn: '#e0a53a', sign: '#c27a2a', label: 'Bakery' },
    { wall: '#fbe7ef', awn: '#e46a9a', sign: '#e46a9a', label: 'Cosmetics shop' },
    { wall: '#e8f1e4', awn: '#3f9b5a', sign: '#3f9b5a', vsign: '#2f7fd0', label: 'Pharmacy' }
  ];
  function randomBuilding(r, x, y, w, d, h, seed) {
    if (!fits(x, y, w, d)) return false;
    claim(x, y, w, d);
    if (h <= 18) {
      var o = Object.assign({}, pick(r, SHOPS)); o.seed = seed;
      shop(x, y, w, d, h, o);
    } else if (r() < 0.55) {
      glassTower(x, y, w, d, h, pick(r, STYLES), seed, h > 36 ? 'Office tower' : 'Office building');
    } else {
      officeBlock(x, y, w, d, h, pick(r, WALLS), seed, 'Office building');
    }
    return true;
  }
  function fillerMid(a, b) {
    var o = blockOrigin(a, b), bx = o[0], by = o[1], r = rng(Math.floor(hash(a, b, 41) * 1e9));
    fillT(bx, by, bx + 6, by + 6, r() < 0.8 ? 'p' : 'g');
    var lots = [[0.6, 0.5, 24, 46], [3.3, 0.5, 16, 34], [0.5, 3.3, 14, 28], [3.4, 3.4, 8, 14]];
    lots.forEach(function (L, k) {
      var w = 1.5 + r() * 0.8, d = 1.5 + r() * 0.8, h = Math.round(L[2] + r() * (L[3] - L[2]));
      if (k === 3 && r() < 0.4) { treeAt(bx + 4.0, by + 4.2, 'round', a * 100 + 7); treeAt(bx + 5.2, by + 4.0, 'ginkgo', a * 100 + 8); treeAt(bx + 4.4, by + 5.4, 'round', a * 100 + 9); return; }
      randomBuilding(r, bx + L[0], by + L[1], w, d, h, Math.floor(r() * 1000));
    });
    treeAt(bx + 2.9, by + 2.9, 'round', a * 31 + 1);
    treeAt(bx + 5.6, by + 2.8, 'ginkgo', a * 31 + 2);
    treeAt(bx + 2.8, by + 5.6, 'round', a * 31 + 3);
  }
  function fillerTop(a, b) {
    var o = blockOrigin(a, b), bx = o[0], by = o[1], r = rng(Math.floor(hash(a, b, 43) * 1e9));
    fillT(bx, by, bx + 6, by + 6, 'p');
    if (!randomBuilding(r, bx + 4.6, by + 4.6, 1.3, 1.3, Math.round(18 + r() * 22), Math.floor(r() * 1000))) treeAt(bx + 5.3, by + 5.3, 'round', a * 17);
    treeAt(bx + 5.6, by + 3.8, 'ginkgo', a * 17 + 1);
    treeAt(bx + 3.8, by + 5.6, 'round', a * 17 + 2);
  }
  function fillerBottom(a, b) {
    var o = blockOrigin(a, b), bx = o[0], by = o[1], r = rng(Math.floor(hash(a, b, 47) * 1e9));
    fillT(bx, by, bx + 6, by + 6, r() < 0.5 ? 'g' : 'p');
    if (r() < 0.6) randomBuilding(r, bx + 0.45, by + 0.45, 1.2, 1.0, Math.round(8 + r() * 6), Math.floor(r() * 1000));
    treeAt(bx + 2.1, by + 0.5, r() < 0.5 ? 'round' : 'ginkgo', a * 13 + 1);
    treeAt(bx + 0.5, by + 2.1, 'round', a * 13 + 2);
    treeAt(bx + 1.6, by + 1.6, 'round', a * 13 + 3);
  }

  // Landmark districts, keyed by the block column a (u = 16a + 9).
  var DISTRICTS = {
    '-4': function (bx, by) { // Gangnam
      fillT(bx, by, bx + 6, by + 6, 'p');
      [[0.6, 0.5, 1.8, 1.8, 50, 'blue'], [0.5, 3.0, 1.6, 1.6, 30, 'teal']].forEach(function (q, k) { if (fits(bx + q[0], by + q[1], q[2], q[3])) { claim(bx + q[0], by + q[1], q[2], q[3]); glassTower(bx + q[0], by + q[1], q[2], q[3], q[4], q[5], 70 + k, 'Gangnam office towers'); } });
      if (fits(bx + 3.0, by + 0.5, 1.7, 1.5)) { claim(bx + 3.0, by + 0.5, 1.7, 1.5); officeBlock(bx + 3.0, by + 0.5, 1.7, 1.5, 38, '#e9dcc4', 72, 'Gangnam office towers'); }
      if (fits(bx + 3.2, by + 3.1, 1.6, 1.4)) { claim(bx + 3.2, by + 3.1, 1.6, 1.4); shop(bx + 3.2, by + 3.1, 1.6, 1.4, 14, { wall: '#efe2cf', awn: '#7a5236', sign: '#7a5236', label: 'Cafe, Gangnam', seed: 73 }); }
      treeAt(bx + 2.7, by + 2.7, 'ginkgo', 74); treeAt(bx + 5.5, by + 2.6, 'round', 75); treeAt(bx + 2.5, by + 5.5, 'round', 76); treeAt(bx + 5.4, by + 5.4, 'ginkgo', 77);
    },
    '-3': function (bx, by) { // apartment complex
      fillT(bx, by, bx + 6, by + 6, 'a');
      [[0.6, 0.5, 4.0, 30, '101'], [2.6, 0.9, 4.0, 33, '102'], [4.4, 1.3, 3.6, 27, '103']].forEach(function (q, k) {
        claim(bx + q[0], by + q[1], 1.4, q[2]);
        apartment(bx + q[0], by + q[1], 1.4, q[2], q[3], q[4], '#3c8dbc', 51 + k);
      });
      treeAt(bx + 2.3, by + 2.6, 'round', 81); treeAt(bx + 4.2, by + 3.2, 'ginkgo', 82); treeAt(bx + 1.5, by + 5.4, 'round', 83); treeAt(bx + 3.6, by + 5.4, 'round', 84); treeAt(bx + 5.5, by + 5.4, 'ginkgo', 85);
    },
    '-2': function (bx, by) { // Lotte World Tower and Seokchon Lake
      fillT(bx, by, bx + 6, by + 6, 'p');
      fillT(bx + 3, by + 3, bx + 6, by + 6, 'l');
      claim(bx + 0.6, by + 0.5, 2, 2); lotteTower(bx + 0.6, by + 0.5);
      claim(bx + 3.0, by + 0.4, 2.6, 1.8); shop(bx + 3.0, by + 0.4, 2.6, 1.8, 12, { wall: '#e9e4dc', awn: '#c0392b', sign: '#c0392b', label: 'Lotte World Mall', seed: 41 });
      [[0.6, 3.2], [1.8, 3.6], [0.7, 5.3], [2.5, 5.4], [5.5, 2.7], [2.7, 2.9]].forEach(function (q, k) { treeAt(bx + q[0], by + q[1], k % 2 ? 'cherry' : 'round', 1200 + k); });
      SWANS.push([bx + 3.2, by + 3.2, bx + 5.8, by + 5.8, null]);
    },
    '-1': function (bx, by) { // Banpo Hangang Park on the south bank, with the 63 Building
      fillT(bx, by + 1, bx + 6, by + 6, 'g');
      fillT(bx, by + 1, bx + 6, by + 2, 'k');
      claim(bx + 0.4, by + 2.3, 1.3, 1.0);
      glassTower(bx + 0.4, by + 2.3, 1.3, 1.0, 42, 'gold', 42, '63 Building', function (p) {
        p.box(bx + 0.4, by + 2.3, 42, 0.8, 1.0, 6, { top: '#f8de91', left: '#e9b847', right: '#c78f2b', ol: OL, rim: true });
      });
      [[3.4, 2.5], [4.6, 2.5]].forEach(function (q) {
        var x = bx + q[0], y = by + q[1];
        claim(x - 0.4, y - 0.25, 0.8, 0.5);
        S(x - 0.4, y - 0.25, x + 0.4, y + 0.25, 0, 7, function (p) {
          p.box(x - 0.4, y - 0.25, 0, 0.8, 0.5, 5, { top: '#f08a3a', left: '#f59a4c', right: '#d9752c', ol: OL, L: function (u, v) { return v < 3 && u > 1 && u < 6 ? (NIGHT ? '!#ffd58a' : '#f9c48d') : null; } });
          p.box(x - 0.42, y - 0.27, 5, 0.84, 0.54, 1, { top: '#e0742a', left: '#c9661f', right: '#b0581a' });
        }, 'Pojangmacha (street food tent)');
        SITTERS.push([x - 0.25, y + 0.45], [x + 0.25, y + 0.45]);
      });
      MATS.push([bx + 2.2, by + 3.6, '#5aa0e0'], [bx + 3.4, by + 4.6, '#e9797f'], [bx + 1.3, by + 4.4, '#f2c14e']);
      SITTERS.push([bx + 2.05, by + 3.5], [bx + 2.4, by + 3.7], [bx + 3.3, by + 4.5], [bx + 1.3, by + 4.4]);
      [[2.0, 2.2], [5.4, 2.0], [1.0, 3.6], [5.4, 4.6], [2.0, 5.5], [4.2, 5.5], [0.4, 5.4]].forEach(function (q, k) { treeAt(bx + q[0], by + q[1], k % 3 === 0 ? 'cherry' : k % 3 === 1 ? 'ginkgo' : 'round', 1100 + k); });
      bench(bx + 2.9, by + 2.2); bench(bx + 5.2, by + 3.3);
      BIKES.push([by + 1.5, bx + 0.2, bx + 5.8]);
    },
    '0': function (bx, by) { // Myeongdong, the Line 2 station and the north bank
      fillT(bx, by, bx + 6, by + 4, 'p');
      fillT(bx, by + 4, bx + 6, by + 5, 'k');
      var shops = [
        [0.3, 0.9, 1.35, 1.5, 26, { wall: '#f4efe8', awn: '#c0392b', sign: '#b03a5b', vsign: '#3b5bdb', label: 'Department store, Myeongdong' }],
        [0.3, 2.6, 1.35, 1.1, 11, { wall: '#f6f6f3', awn: '#3aa0d8', sign: '#2f7fd0', label: 'Convenience store' }],
        [3.3, 0.3, 1.2, 1.2, 13, { wall: '#fbe7ef', awn: '#e46a9a', sign: '#e46a9a', label: 'Cosmetics shop, Myeongdong' }],
        [4.7, 0.3, 1.2, 1.5, 20, { wall: '#e6ddd0', awn: '#6d5a87', vsign: '#2f9e8f', label: 'Hotel' }],
        [3.3, 1.8, 1.2, 1.2, 18, { wall: '#f0d9c0', awn: '#d9483b', sign: '#e8573f', vsign: '#f2b233', label: 'Chicken and beer' }],
        [4.7, 2.1, 1.2, 1.3, 16, { wall: '#e0d4f0', awn: '#8a5bd6', sign: '#8a5bd6', vsign: '#ff5aa5', label: 'Noraebang (karaoke)' }]
      ];
      shops.forEach(function (q, k) { q[5].seed = 21 + k; claim(bx + q[0], by + q[1], q[2], q[3]); shop(bx + q[0], by + q[1], q[2], q[3], q[4], q[5]); });
      station(by + 0.6, by + 2.6);
      [[0.6, 4.85], [3.6, 4.85], [5.4, 4.85]].forEach(function (q, k) { treeAt(bx + q[0], by + q[1], k === 1 ? 'cherry' : 'round', 1000 + k); });
      BIKES.push([by + 4.5, bx + 0.2, bx + 5.8]);
    },
    '1': function (bx, by) { // Gyeongbokgung Palace and Gwanghwamun Square
      fillT(bx, by, bx + 6, by + 4, 'd');
      fillT(bx, by + 4, bx + 6, by + 6, 'p');
      claim(bx + 0.9, by + 0.3, 3.6, 2.0); palaceHall(bx + 1.2, by + 0.6, 3.0, 1.4);
      stoneWall(bx + 0.2, by + 3.7, 1.9, 0.16, 4); stoneWall(bx + 3.9, by + 3.7, 1.9, 0.16, 4);
      stoneWall(bx + 5.64, by + 0.4, 0.16, 3.46, 4); stoneWall(bx + 0.2, by + 1.0, 0.16, 2.86, 4);
      claim(bx + 2.1, by + 3.45, 1.8, 0.65); gwanghwamun(bx + 2.1, by + 3.45, 1.8, 0.65);
      claim(bx + 2.75, by + 4.5, 0.5, 0.4); sejongStatue(bx + 3.0, by + 4.7);
      claim(bx + 0.2, by + 3.6, 5.6, 0.3);
      [[0.6, 4.7, 'ginkgo'], [5.4, 4.7, 'ginkgo'], [1.6, 5.5, 'ginkgo'], [4.4, 5.5, 'ginkgo'], [0.8, 2.6, 'pine'], [5.1, 1.0, 'round'], [4.9, 2.8, 'pine']].forEach(function (q, k) { treeAt(bx + q[0], by + q[1], q[2], 700 + k); });
      PALACE.push([bx + 3.0, by + 5.2], [bx + 3.0, by + 3.0], [bx + 0.9, by + 4.9], [bx + 5.1, by + 4.9]);
    },
    '2': function (bx, by) { // Namsan and N Seoul Tower
      NAM.on = true; NAM.bx = bx; NAM.by = by; NAM.cx = bx + 2.6; NAM.cy = by + 2.4;
      var r = rng(777), x, y;
      for (y = 0; y < 6; y++) {
        for (x = 0; x < 6; x++) {
          (function (ix, iy) {
            var h = hillH(ix, iy);
            if (h <= 0 || ix + iy < 0) return;
            claim(ix, iy, 1, 1);
            S(ix, iy, ix + 1, iy + 1, 0, h, function (p) {
              var grass = WINTER ? '#eef3f7' : SEASON === 'autumn' ? '#93c25e' : '#8ac85f';
              p.box(ix, iy, 0, 1, 1, h, {
                top: grass, left: '#a98762', right: '#8b6c4d',
                L: function (u, v, len, hh) { if (v >= hh - 2) return WINTER ? '#dfe7ee' : '#72b552'; return hash(u + ix * 9, v + iy * 5, 2) < 0.12 ? '#b9a07e' : null; },
                R: function (u, v, len, hh) { if (v >= hh - 2) return WINTER ? '#cdd8e2' : '#5c9b44'; return hash(u + ix * 7, v + iy * 3, 3) < 0.12 ? '#9c8162' : null; }
              });
            }, 'Namsan');
          })(bx + x, by + y);
        }
      }
      var px = bx + 2, py = by + 2, tx = bx + 3, ty = by + 2;
      seoulTower(px + 0.5, py + 0.5, hillH(px, py));
      cableStation(tx + 0.25, ty + 0.25, hillH(tx, ty), 0.6, 0.55);
      var base = [bx + 4.7, by + 4.4];
      claim(base[0], base[1], 0.9, 0.8); cableStation(base[0], base[1], 0, 0.9, 0.8);
      CABLE.a = [base[0] + 0.45, base[1] + 0.4, 7];
      CABLE.b = [tx + 0.55, ty + 0.52, hillH(tx, ty) + 6];
      CABLE.on = true;
      TOWER.x = px + 0.5; TOWER.y = py + 0.5; TOWER.z = hillH(px, py);
      for (y = 0; y < 6; y++) {
        for (x = 0; x < 6; x++) {
          var ix = bx + x, iy = by + y, hh = hillH(ix, iy);
          if ((ix === px && iy === py) || (ix === tx && iy === ty)) continue;
          for (var i = 0; i < (hh > 0 ? 2 : 1); i++) {
            var qx = ix + 0.2 + r() * 0.6, qy = iy + 0.2 + r() * 0.6, kind = r() < 0.45 ? 'pine' : 'round', seed = Math.floor(r() * 1e6);
            if (hh > 0) { if (qx + qy > 0.3) tree(qx, qy, hh, kind, seed); }
            else treeAt(qx, qy, kind, seed);
          }
        }
      }
    },
    '3': function (bx, by) { // Bukchon hanok village and the pond pavilion
      fillT(bx, by, bx + 6, by + 6, 'q');
      fillT(bx + 3, by + 3, bx + 6, by + 6, 'l');
      fillT(bx + 4, by + 4, bx + 5, by + 5, 'q');
      [[0.6, 0.5, 2.0, 1.2], [3.2, 0.6, 2.2, 1.2], [0.5, 2.4, 2.0, 1.2], [0.5, 4.3, 2.0, 1.2]].forEach(function (q, k) {
        claim(bx + q[0] - 0.2, by + q[1] - 0.2, q[2] + 0.4, q[3] + 0.4);
        hanok(bx + q[0], by + q[1], q[2], q[3], 61 + k);
      });
      pavilion(bx + 4.5, by + 4.5);
      S(bx + 4.42, by + 5.0, bx + 4.58, by + 6.0, -1, 1, function (p) { p.box(bx + 4.42, by + 5.0, -1, 0.16, 1.0, 1, { top: '#a8744a', left: '#8d5f3b', right: '#73492c' }); }, 'Pavilion on the palace pond');
      SWANS.push([bx + 3.15, by + 3.15, bx + 5.85, by + 5.85, [bx + 4.5, by + 4.5]]);
      [[5.6, 2.2, 'round'], [2.2, 3.95, 'ginkgo'], [1.5, 5.75, 'round'], [5.7, 0.35, 'ginkgo']].forEach(function (q, k) { treeAt(bx + q[0], by + q[1], q[2], 1400 + k); });
      HANOK.push([bx + 2.9, by + 5.82], [bx + 2.9, by + 3.9], [bx + 2.9, by + 2.1]);
    },
    '4': function (bx, by) { // Jongno business district
      fillT(bx, by, bx + 6, by + 6, 'p');
      claim(bx + 0.6, by + 0.5, 1.9, 1.9); glassTower(bx + 0.6, by + 0.5, 1.9, 1.9, 54, 'teal', 11, 'Office towers, Jongno');
      claim(bx + 3.2, by + 0.4, 2.0, 1.6); officeBlock(bx + 3.2, by + 0.4, 2.0, 1.6, 40, '#e9dcc4', 12, 'Office towers, Jongno');
      claim(bx + 0.6, by + 3.0, 1.6, 1.6); glassTower(bx + 0.6, by + 3.0, 1.6, 1.6, 32, 'dark', 13, 'Office towers, Jongno');
      claim(bx + 3.1, by + 2.8, 2.4, 2.4); officeBlock(bx + 3.1, by + 2.8, 2.4, 2.4, 22, '#f1f0ec', 14, 'Seoul City Hall area', function (p) {
        var c = P(bx + 4.3, by + 4.0, 22);
        p.ellipse(c[0], c[1], 6, 3, '#d2cfc9'); p.ellipse(c[0], c[1], 5, 2.4, '#5c6470');
        p.rect(c[0] - 2, c[1] - 1, 1, 3, '#f4f1ec'); p.rect(c[0] + 2, c[1] - 1, 1, 3, '#f4f1ec'); p.rect(c[0] - 1, c[1], 3, 1, '#f4f1ec');
      });
      treeAt(bx + 2.8, by + 2.6, 'ginkgo', 901); treeAt(bx + 5.6, by + 2.4, 'ginkgo', 902); treeAt(bx + 2.6, by + 5.6, 'ginkgo', 903);
    }
  };

  // Named spots used to seed agents.
  var SWANS = [], SITTERS = [], MATS = [], BIKES = [], PALACE = [], HANOK = [];
  var CABLE = { on: false }, TOWER = { x: 0, y: 0, z: 0 };
  var ROADS_A = [], ROADS_B = [];   // visible road indices (b for road A, a for road B)

  function buildCity() {
    statics = []; lamps = []; footprints = []; LAND = {};
    SWANS = []; SITTERS = []; MATS = []; BIKES = []; PALACE = []; HANOK = [];
    CABLE = { on: false }; NAM.on = false;
    var a, b;
    // landmark districts first so they can claim their space
    for (a = -12; a <= 12; a++) {
      b = -1 - a;
      var o = blockOrigin(a, b), uc = 16 * a + 9;
      if (uc < UMIN - 8 || uc > UMAX + 8) continue;
      if (DISTRICTS[a]) DISTRICTS[a](o[0], o[1]);
    }
    for (a = -12; a <= 12; a++) {
      if (!DISTRICTS[a] && 16 * a + 9 > UMIN - 8 && 16 * a + 9 < UMAX + 8) fillerMid(a, -1 - a);
      if (16 * a + 17 > UMIN - 8 && 16 * a + 17 < UMAX + 8) fillerTop(a, -2 - a);
      if (16 * a + 1 > UMIN - 8 && 16 * a + 1 < UMAX + 8) fillerBottom(a, -a);
    }
    // Banpo Bridge (and any other road B crossing of the river inside the strip)
    for (a = -12; a <= 12; a++) {
      var x0 = 8 * a + 2;
      if (x0 + 4 < 0 || x0 > VB + 1) continue;
      for (var gy = 0; gy < 4; gy++) if (x0 + gy < VB + 1) { roadBridgeTile(x0, gy); roadBridgeRail(x0, gy); }
    }
    // Line 2 viaduct
    for (var y = -8; y < VB - RAILX + 1; y++) if (RAILX + y + 1 > 0) viaductTile(y);
    railTruss(RAILX + 0.05, false); railTruss(RAILX + 0.9, true);
    // visible roads
    ROADS_A = []; ROADS_B = [];
    for (b = -10; b <= 10; b++) { if (b === 0) continue; var c = 8 * b + 2; if (-2 * c + VB > UMIN && -2 * c < UMAX) ROADS_A.push(b); }
    for (a = -10; a <= 10; a++) { var cx = 8 * a + 3; if (2 * cx > UMIN && 2 * cx - VB < UMAX) ROADS_B.push(a); }
    // street lamps along both sides of every road
    function lampOK(x, y) {
      if (!inUView(x, y) || x + y < 0.4 || x + y > VB - 0.4) return false;
      for (var i = 0; i < footprints.length; i++) { var f = footprints[i]; if (x > f[0] - 0.1 && x < f[2] + 0.1 && y > f[1] - 0.1 && y < f[3] + 0.1) return false; }
      return !isWater(tAt(Math.floor(x), Math.floor(y))) && !isRoad(Math.floor(x), Math.floor(y));
    }
    ROADS_A.forEach(function (bb) {
      var y0 = 8 * bb + 1, y1 = y0 + 2, ix0 = -8 * bb + 2;
      for (var gx = -y0 - 1; gx < VB - y0 + 1; gx += 2.6) {
        if (gx > ix0 - 1.4 && gx < ix0 + 3.4) continue;
        if (lampOK(gx, y0 - 0.22)) lamp(gx, y0 - 0.22);
        if (lampOK(gx + 1.3, y1 + 0.22)) lamp(gx + 1.3, y1 + 0.22);
      }
    });
    ROADS_B.forEach(function (aa) {
      var x0 = 8 * aa + 2, x1 = x0 + 2, iy0 = -8 * aa + 1;
      for (var gy = -x0 - 1; gy < VB - x0 + 1; gy += 2.6) {
        if (aa !== 0 && gy > iy0 - 1.4 && gy < iy0 + 3.4) continue;
        if (lampOK(x0 - 0.22, gy)) lamp(x0 - 0.22, gy);
        if (lampOK(x1 + 0.22, gy + 1.3)) lamp(x1 + 0.22, gy + 1.3);
      }
    });
  }

  // ---------------------------------------------------------------- depth ordering of statics
  function boxOverlap(a, b) { return a.bx0 < b.bx1 && b.bx0 < a.bx1 && a.by0 < b.by1 && b.by0 < a.by1; }
  function inFrontS(A, B) {
    var e = 1e-6;
    if (A.x0 >= B.x1 - e || A.y0 >= B.y1 - e) return true;
    if (B.x0 >= A.x1 - e || B.y0 >= A.y1 - e) return false;
    if (A.z0 !== B.z0) return A.z0 > B.z0;
    return (A.x0 + A.x1 + A.y0 + A.y1) > (B.x0 + B.x1 + B.y0 + B.y1);
  }
  var order = [];
  function prerenderAll() {
    statics.forEach(function (s) {
      var rp = new Painter(null);
      rp.rec = [1e9, 1e9, -1e9, -1e9];
      s.draw(rp);
      var rr = rp.rec;
      if (rr[0] > rr[2]) { s.cv = null; s.bx0 = s.by0 = s.bx1 = s.by1 = 0; return; }
      s.bx0 = rr[0]; s.by0 = rr[1]; s.bx1 = rr[2]; s.by1 = rr[3];
      s.cv = mk(rr[2] - rr[0], rr[3] - rr[1]);
      s.draw(new Painter(s.cv.getContext('2d'), rr[0], rr[1]));
      s.alpha = null;   // read back lazily on first hover (GPU readback is slow)
    });
    var n = statics.length, before = statics.map(function () { return []; }), i, j;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        if (!statics[i].cv || !statics[j].cv || !boxOverlap(statics[i], statics[j])) continue;
        if (inFrontS(statics[i], statics[j])) before[i].push(j); else before[j].push(i);
      }
    }
    var idx = statics.map(function (s, k) { return k; }).sort(function (a, b) {
      var A = statics[a], B = statics[b];
      return (A.x0 + A.y0) - (B.x0 + B.y0) || A.z0 - B.z0;
    });
    var state = new Uint8Array(n);
    order = [];
    function visit(k) {
      if (state[k]) return;
      state[k] = 1;
      for (var m = 0; m < before[k].length; m++) visit(before[k][m]);
      state[k] = 2;
      order.push(statics[k]);
    }
    idx.forEach(visit);
    order = order.filter(function (s) { return s.cv; });
    order.forEach(function (s, k) { s.ord = k; });
  }

  // ---------------------------------------------------------------- simulation: signals
  function Signal() { this.t = rnd(0, 20); }
  Signal.prototype.update = function (dt) { this.t = (this.t + dt) % 20; };
  Signal.prototype.car = function (axis) {
    var t = this.t;
    if (axis === 'x') return t < 8 ? 'green' : t < 10 ? 'yellow' : 'red';
    return t >= 10 && t < 18 ? 'green' : t >= 18 ? 'yellow' : 'red';
  };
  Signal.prototype.walk = function (axis) { var t = this.t; return axis === 'x' ? t < 5.5 : t >= 10 && t < 15.5; };
  var SIG = {};   // keyed by the intersection's road-B index a (road A index is -a)

  // ---------------------------------------------------------------- agents
  var agents = [];
  function fadeIn(s, lo, hi) { return Math.max(0, Math.min(1, (s - lo) / 0.6, (hi - s) / 0.6)); }

  // Pre-rendered vehicle sprites --------------------------------------------------
  var CARS = {
    car: { L: 0.62, Wd: 0.34, h: 3, ch: 3 },
    bus: { L: 1.3, Wd: 0.42, h: 7, ch: 0 },
    train: { L: 0.92, Wd: 0.56, h: 6, ch: 0 },
    boat: { L: 1.9, Wd: 0.6, h: 3, ch: 3 }
  };
  function vehicleSprite(kind, axis, dir, body) {
    var g = CARS[kind], cx = 13.5, cy = 13.5, L = g.L, Wd = g.Wd;
    var bx = axis === 'x' ? cx - L / 2 : cx - Wd / 2, by = axis === 'x' ? cy - Wd / 2 : cy - L / 2, bw = axis === 'x' ? L : Wd, bd = axis === 'x' ? Wd : L;
    var draw = function (p) {
      var frontOnL = axis === 'y' && dir > 0, frontOnR = axis === 'x' && dir > 0, backOnL = axis === 'y' && dir < 0, backOnR = axis === 'x' && dir < 0;
      var lights = function (isL) {
        return function (u, v, len) {
          var fr = isL ? frontOnL : frontOnR, bk = isL ? backOnL : backOnR;
          if (v !== 1 || !(fr || bk)) return null;
          if (u === 0 || u === len - 1) return fr ? (NIGHT ? '!#fff6c8' : '#fff6d0') : (NIGHT ? '!#ff4a4a' : '#d9483b');
          return null;
        };
      };
      if (kind === 'car') {
        p.box(bx, by, 0, bw, bd, g.h, { top: body.top, left: body.left, right: body.right, ol: OL, L: lights(true), R: lights(false) });
        var ins = 0.06, cl = axis === 'x' ? 0.18 : 0.04;
        var kx = axis === 'x' ? bx + L * 0.2 : bx + ins, ky = axis === 'x' ? by + ins : by + L * 0.2, kw = axis === 'x' ? L * 0.52 : Wd - 2 * ins, kd = axis === 'x' ? Wd - 2 * ins : L * 0.52;
        p.box(kx, ky, g.h, kw, kd, g.ch - 1, { top: body.top, left: '#4b5b6a', right: '#3e4c5a', ol: OL, L: function (u, v, len) { return u === 0 || u === len - 1 ? body.left : (v === 1 && u === 1 ? '#a8c4d8' : null); }, R: function (u, v, len) { return u === 0 || u === len - 1 ? body.right : null; } });
        void cl;
        if (body.taxi) { var t = P(cx, cy, g.h + g.ch - 1); p.rect(t[0] - 1, t[1] - 2, 2, 2, NIGHT ? '!#ffe066' : '#f8f2e0'); }
      } else if (kind === 'bus') {
        var win = function (u, v, len) { if (v >= 3 && v <= 5 && u > 0 && u < len - 1) return NIGHT ? '!#ffe9b0' : (u % 4 === 0 ? body.left : '#45566a'); return lights(true)(u, v, len); };
        var winR = function (u, v, len) { if (v >= 3 && v <= 5 && u > 0 && u < len - 1) return NIGHT ? '!#ffe0a0' : (u % 4 === 0 ? body.right : '#3a4a5c'); return lights(false)(u, v, len); };
        p.box(bx, by, 0, bw, bd, g.h, { top: lt(body.top, 0.1), left: body.left, right: body.right, ol: OL, L: win, R: winR, rim: true });
      } else if (kind === 'train') {
        var tw = function (dark) {
          return function (u, v, len) {
            if (u === 0 || u === len - 1) return dark ? '#9aa3ad' : '#c3cbd3';
            if (v === 1) return '#2fa24f';
            if (v >= 3 && v <= 4) return NIGHT ? '!#fff1c8' : (u % 5 === 0 ? null : '#4c5c6c');
            return null;
          };
        };
        p.box(bx, by, VZ, bw, bd, g.h, { top: '#dfe4e8', left: '#e6e9ec', right: '#bcc3ca', ol: OL, L: tw(false), R: tw(true), rim: true });
      } else if (kind === 'boat') {
        p.box(bx, by, -RIVER_D - 1, bw, bd, 3, { top: '#f4f2ee', left: '#f6f5f2', right: '#d6d3cd', ol: OL, L: function (u, v) { return v === 1 ? '#2f6fb3' : null; }, R: function (u, v) { return v === 1 ? '#245a94' : null; } });
        var dx = axis === 'x' ? L * 0.15 : 0.08, dy2 = axis === 'x' ? 0.08 : L * 0.15;
        p.box(bx + dx, by + dy2, -RIVER_D + 2, bw - (axis === 'x' ? L * 0.35 : 0.16), bd - (axis === 'x' ? 0.16 : L * 0.35), 3, { top: '#e8e6e1', left: '#ffffff', right: '#dedbd5', ol: OL, L: function (u, v) { return v === 1 && u % 3 ? (NIGHT ? '!#ffe3a0' : '#5c7c96') : null; }, R: function (u, v) { return v === 1 && u % 3 ? (NIGHT ? '!#ffd890' : '#4d6a82') : null; } });
        p.box(bx + dx * 2.2, by + dy2 * (axis === 'x' ? 1.6 : 2.2), -RIVER_D + 5, axis === 'x' ? L * 0.3 : Wd * 0.6, axis === 'x' ? Wd * 0.6 : L * 0.3, 2, { top: '#d9483b', left: '#e8e6e1', right: '#cfccc5', ol: OL });
      }
    };
    var rp = new Painter(null); rp.rec = [1e9, 1e9, -1e9, -1e9]; draw(rp);
    var r = rp.rec, cv = mk(r[2] - r[0], r[3] - r[1]);
    draw(new Painter(cv.getContext('2d'), r[0], r[1]));
    var o = P(cx, cy, 0);
    return { cv: cv, dx: r[0] - o[0], dy: r[1] - o[1] };
  }
  var CAR_COLORS = [
    { top: '#f7f7f5', left: '#ecebe8', right: '#c9c7c3' },
    { top: '#f7f7f5', left: '#ecebe8', right: '#c9c7c3' },
    { top: '#5a5f69', left: '#43474f', right: '#33363d' },
    { top: '#d3d8dd', left: '#bfc5cc', right: '#9aa1a9' },
    { top: '#d3d8dd', left: '#bfc5cc', right: '#9aa1a9' },
    { top: '#5b7fb0', left: '#4a6c9c', right: '#3a5680' },
    { top: '#d9584a', left: '#c64a3d', right: '#9f3a30' },
    { top: '#f6a24a', left: '#ee8f33', right: '#c97424', taxi: true },
    { top: '#f6a24a', left: '#ee8f33', right: '#c97424', taxi: true }
  ];
  var BUS_COLORS = [{ top: '#6fa0e8', left: '#3d7ad6', right: '#2f62b0' }, { top: '#7ccf86', left: '#45b05a', right: '#368f48' }];
  var spriteCache = {};
  function sprite(kind, axis, dir, ci) {
    var k = kind + axis + dir + ci;
    if (!spriteCache[k]) {
      var body = kind === 'bus' ? BUS_COLORS[ci] : CAR_COLORS[ci];
      spriteCache[k] = vehicleSprite(kind, axis, dir, body || {});
    }
    return spriteCache[k];
  }
  function blit(ctx, spr, gx, gy, z, alpha) {
    var o = P(gx, gy, z || 0);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(spr.cv, o[0] + spr.dx, o[1] + spr.dy);
    if (alpha < 1) ctx.globalAlpha = 1;
  }

  // Lanes ---------------------------------------------------------------------
  // Korea drives on the right. Stop positions are the front bumper position.
  // Lane coordinate s runs along the road axis; v = s + c is the depth in the strip.
  function fadeV(v) { return Math.max(0, Math.min(1, (v + 0.1) / 0.7)); }
  var LANES = [];
  function buildLanes() {
    LANES = [];
    ROADS_A.forEach(function (b) {
      var y0 = 8 * b + 1, a = -b, x0 = 8 * a + 2, has = !!SIG[a];
      LANES.push({ axis: 'x', c: y0 + 1.5, dir: 1, stops: has ? [{ s: x0 - 0.88, sig: a }] : [] });
      LANES.push({ axis: 'x', c: y0 + 0.5, dir: -1, stops: has ? [{ s: x0 + 2.88, sig: a }] : [] });
    });
    ROADS_B.forEach(function (a) {
      var x0 = 8 * a + 2, y0 = -8 * a + 1, has = !!SIG[a];
      LANES.push({ axis: 'y', c: x0 + 0.5, dir: 1, stops: has ? [{ s: y0 - 0.88, sig: a }] : [] });
      LANES.push({ axis: 'y', c: x0 + 1.5, dir: -1, stops: has ? [{ s: y0 + 2.88, sig: a }] : [] });
    });
    LANES.forEach(function (l) { l.cars = []; l.timer = rnd(0, 4); l.lo = -1.2 - l.c; l.hi = VB + 1.2 - l.c; });
  }
  function Car(lane) {
    var bus = Math.random() < 0.14;
    this.kind = bus ? 'bus' : 'car';
    this.ci = bus ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * CAR_COLORS.length);
    this.L = CARS[this.kind].L;
    this.lane = lane;
    this.s = lane.dir > 0 ? lane.lo : lane.hi;
    this.vmax = bus ? 0.9 : rnd(1.1, 1.5);
    this.v = this.vmax;
    this.spr = sprite(this.kind, lane.axis, lane.dir, this.ci);
    this.label = bus ? (this.ci ? 'Seoul green bus' : 'Seoul blue bus') : (CAR_COLORS[this.ci].taxi ? 'Seoul taxi' : null);
    this.z = 0;
    this.pos();
  }
  Car.prototype.pos = function () {
    var l = this.lane;
    if (l.axis === 'x') { this.ax = this.s; this.ay = l.c; } else { this.ax = l.c; this.ay = this.s; }
    this.alpha = fadeV(this.ax + this.ay);
  };
  Car.prototype.update = function (dt) {
    var l = this.lane, dir = l.dir, self = this, target = this.vmax, front = this.s + dir * this.L / 2;
    var gap = 1e9, lead = null;
    l.cars.forEach(function (o) { if (o === self) return; var ds = (o.s - self.s) * dir; if (ds > 0 && ds < gap) { gap = ds; lead = o; } });
    if (lead) target = Math.min(target, Math.max(0, (gap - (this.L + lead.L) / 2 - 0.28) * 2.2));
    l.stops.forEach(function (st) {
      var dist = (st.s - front) * dir;
      if (dist > -0.05 && dist < 2.4) {
        var ph = SIG[st.sig].car(l.axis);
        if (ph === 'red' || (ph === 'yellow' && dist > 0.45)) target = Math.min(target, Math.max(0, dist * 2.3 - 0.04));
      }
    });
    var a = target > this.v ? 1.4 : 5, dv = target - this.v;
    this.v += Math.sign(dv) * Math.min(Math.abs(dv), a * dt);
    this.s += dir * this.v * dt;
    this.pos();
    if (this.s < l.lo - 0.2 || this.s > l.hi + 0.2) this.dead = true;
  };
  Car.prototype.box = function () { var o = P(this.ax, this.ay, 0); return [o[0] + this.spr.dx, o[1] + this.spr.dy, o[0] + this.spr.dx + this.spr.cv.width, o[1] + this.spr.dy + this.spr.cv.height]; };
  Car.prototype.draw = function (ctx) { if (this.alpha > 0) blit(ctx, this.spr, this.ax, this.ay, 0, this.alpha); };
  Car.prototype.glow = function (ctx) {
    if (this.alpha <= 0) return;
    var l = this.lane, fx = l.axis === 'x' ? this.s + l.dir * (this.L / 2 + 0.35) : l.c, fy = l.axis === 'y' ? this.s + l.dir * (this.L / 2 + 0.35) : l.c;
    glowAt(ctx, P(fx, fy, 1), 5, 'rgba(255,240,190,0.22)');
  };

  // Train -------------------------------------------------------------------------
  var TX = RAILX + 0.5, STATION_Y = -3.4;
  function Train(dir) {
    this.dir = dir; this.cars = 4; this.gap = 0.98;
    this.s = dir > 0 ? -1.2 - TX : VB + 1.2 - TX;
    this.v = 1.6; this.wait = 0; this.stopped = false;
    this.spr = sprite('train', 'y', dir, 0);
    this.label = 'Seoul Metro Line 2';
  }
  Train.prototype.update = function (dt) {
    var stopAt = STATION_Y + this.dir * (this.cars - 1) * this.gap / 2;
    var dist = (stopAt - this.s) * this.dir;
    if (!this.stopped && dist > 0 && dist < 2.5) this.v = Math.max(0.12, dist * 0.8);
    else if (!this.stopped) this.v = Math.min(1.6, this.v + dt * 0.8);
    if (!this.stopped && dist <= 0.02 && dist > -0.5) { this.stopped = true; this.wait = 3; this.v = 0; }
    if (this.stopped === true) { this.wait -= dt; if (this.wait <= 0) this.stopped = 'done'; }
    if (this.stopped === 'done') this.v = Math.min(1.6, this.v + dt * 0.6);
    this.s += this.dir * this.v * dt;
    var tail = this.s - this.dir * this.cars * this.gap;
    if ((this.dir > 0 && tail + TX > VB + 1.5) || (this.dir < 0 && tail + TX < -1.5)) this.dead = true;
  };
  function TrainCar(train, k) { this.train = train; this.k = k; this.z = VZ; this.spr = train.spr; this.label = train.label; }
  TrainCar.prototype.update = function () {
    var t = this.train;
    this.ax = TX; this.ay = t.s - t.dir * this.k * t.gap;
    this.alpha = fadeV(this.ax + this.ay);
    this.dead = t.dead;
  };
  TrainCar.prototype.box = Car.prototype.box;
  TrainCar.prototype.draw = function (ctx) { if (this.alpha > 0) blit(ctx, this.spr, this.ax, this.ay, 0, this.alpha); };

  // Boats ---------------------------------------------------------------------------
  function Boat(dir) {
    this.dir = dir; this.c = dir > 0 ? 2.6 : 1.3;
    this.s = dir > 0 ? -2 - this.c : VB + 2 - this.c;
    this.v = 0.45; this.z = -RIVER_D; this.spr = sprite('boat', 'x', dir, 0); this.label = 'Han River cruise';
  }
  Boat.prototype.update = function (dt) {
    this.s += this.dir * this.v * dt; this.ax = this.s; this.ay = this.c;
    this.alpha = fadeV(this.s + this.c - 0.8);
    if (this.s + this.c < -2.5 || this.s + this.c > VB + 2.5) this.dead = true;
  };
  Boat.prototype.box = Car.prototype.box;
  Boat.prototype.draw = function (ctx) {
    if (this.alpha <= 0) return;
    var p = new Painter(ctx), w = P(this.s - this.dir * 1.1, this.c, -RIVER_D);
    ctx.globalAlpha = this.alpha * 0.8;
    for (var k = 0; k < 4; k++) { p.px(w[0] - this.dir * k * 2, w[1] - k, '#e6f4fb'); p.px(w[0] - this.dir * k * 2, w[1] + k + 1, '#d3ecf8'); }
    ctx.globalAlpha = 1;
    blit(ctx, this.spr, this.ax, this.ay, 0, this.alpha);
  };

  // Swan boats on the lakes -----------------------------------------------------------
  function Swan(x0, y0, x1, y1, ring) {
    this.b = [x0, y0, x1, y1]; this.ring = ring; this.z = -LAKE_D; this.t = 0;
    this.pickTarget(); this.ax = this.tx; this.ay = this.ty; this.pickTarget();
    this.label = 'Swan boat';
  }
  Swan.prototype.pickTarget = function () {
    for (var k = 0; k < 20; k++) {
      this.tx = rnd(this.b[0], this.b[2]); this.ty = rnd(this.b[1], this.b[3]);
      if (!this.ring || Math.abs(this.tx - this.ring[0]) > 0.75 || Math.abs(this.ty - this.ring[1]) > 0.75) return;
    }
  };
  Swan.prototype.update = function (dt) {
    var dx = this.tx - this.ax, dy = this.ty - this.ay, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.05) this.pickTarget();
    else { this.ax += dx / d * 0.18 * dt; this.ay += dy / d * 0.18 * dt; this.face = (dx - dy) >= 0 ? 1 : -1; }
    this.t += dt;
  };
  Swan.prototype.box = function () { var o = P(this.ax, this.ay, -LAKE_D); return [o[0] - 4, o[1] - 7, o[0] + 4, o[1] + 2]; };
  Swan.prototype.draw = function (ctx) {
    var p = new Painter(ctx), o = P(this.ax, this.ay, -LAKE_D), f = this.face || 1, bob = Math.floor(this.t * 2) & 1;
    p.rect(o[0] - 3, o[1] - 2 - bob, 6, 2, '#ffffff'); p.rect(o[0] - 3, o[1] - bob, 6, 1, '#d9e6ee');
    p.rect(o[0] - 3, o[1] - 3 - bob, 1, 1, OL); p.rect(o[0] + 2, o[1] - 3 - bob, 1, 1, OL);
    p.rect(o[0] + f * 2, o[1] - 6 - bob, 1, 4, '#ffffff'); p.px(o[0] + f * 3, o[1] - 6 - bob, '#f08a3a');
    p.px(o[0] - 1, o[1] - 3 - bob, '#7fc2e8');
  };

  // Pedestrians ---------------------------------------------------------------------
  var G = { nodes: [], adj: [] };
  function gnode(x, y) {
    for (var i = 0; i < G.nodes.length; i++) if (Math.abs(G.nodes[i][0] - x) < 0.02 && Math.abs(G.nodes[i][1] - y) < 0.02) return i;
    G.nodes.push([x, y]); G.adj.push([]);
    return G.nodes.length - 1;
  }
  function glink(a, b, cross) {
    if (a === b) return;
    var e = { a: a, b: b, cross: cross || null };
    G.adj[a].push(e); G.adj[b].push(e);
  }
  function gpath(pts, cross) { for (var i = 0; i + 1 < pts.length; i++) glink(gnode(pts[i][0], pts[i][1]), gnode(pts[i + 1][0], pts[i + 1][1]), cross); }
  // Sidewalk lines are collected first so that crossings and side paths can be spliced in.
  var LINES = [];
  var VMIN = 0.35, VMAX = VB - 0.35;
  function addLine(axis, c, lo, hi, holes) {
    // clip to the strip depth and the world width
    if (axis === 'x') { lo = Math.max(lo, VMIN - c, UMIN + 1 + c); hi = Math.min(hi, VMAX - c, UMAX - 1 + c); }
    else { lo = Math.max(lo, VMIN - c, c - UMAX + 1); hi = Math.min(hi, VMAX - c, c - UMIN - 1); }
    var segs = [[lo, hi]];
    (holes || []).forEach(function (h) {
      var out = [];
      segs.forEach(function (s) {
        if (h[1] <= s[0] || h[0] >= s[1]) { out.push(s); return; }
        if (h[0] > s[0]) out.push([s[0], h[0]]);
        if (h[1] < s[1]) out.push([h[1], s[1]]);
      });
      segs = out;
    });
    segs.forEach(function (s) { if (s[1] - s[0] > 0.2) LINES.push({ axis: axis, c: c, lo: s[0], hi: s[1], pts: [s[0], s[1]] }); });
  }
  function junction(x, y) {
    LINES.forEach(function (L) {
      var along = L.axis === 'x' ? x : y, off = L.axis === 'x' ? y : x;
      if (Math.abs(off - L.c) < 0.02 && along >= L.lo - 0.02 && along <= L.hi + 0.02) L.pts.push(along);
    });
  }
  function buildGraph() {
    G = { nodes: [], adj: [] }; LINES = [];
    var extra = [], crossings = [];
    ROADS_A.forEach(function (b) {
      var y0 = 8 * b + 1, y1 = y0 + 2, x0 = -8 * b + 2, x1 = x0 + 2, hole = [[x0 - 0.18, x1 + 0.18]];
      addLine('x', y0 - 0.18, -1e9, 1e9, hole);
      addLine('x', y1 + 0.18, -1e9, 1e9, hole);
    });
    ROADS_B.forEach(function (a) {
      var x0 = 8 * a + 2, x1 = x0 + 2, y0 = -8 * a + 1, y1 = y0 + 2, holes = [[-0.3, 4.3]];
      if (SIG[a]) holes.push([y0 - 0.18, y1 + 0.18]);
      addLine('y', x0 - 0.18, -1e9, 1e9, holes);
      addLine('y', x1 + 0.18, -1e9, 1e9, holes);
      if (SIG[a]) {
        var c = function (axis) { return { sig: a, axis: axis }; };
        crossings.push([[x0 - 0.18, y0 - 0.5], [x1 + 0.18, y0 - 0.5], c('x')], [[x0 - 0.18, y1 + 0.5], [x1 + 0.18, y1 + 0.5], c('x')]);
        crossings.push([[x0 - 0.5, y0 - 0.18], [x0 - 0.5, y1 + 0.18], c('y')], [[x1 + 0.5, y0 - 0.18], [x1 + 0.5, y1 + 0.18], c('y')]);
      }
    });
    // Banpo Bridge sidewalks, riverside promenades and district paths
    extra.push([[1.82, -0.3], [2.16, 0.0], [2.16, 4.0], [1.82, 4.3]]);
    extra.push([[4.18, -0.3], [3.84, 0.0], [3.84, 4.0], [4.18, 4.3]]);
    extra.push([[4.18, -0.9], [9.82, -0.9]]);
    extra.push([[1.82, 4.85], [-3.82, 4.85]]);
    if (PALACE.length) {
      var bx = PALACE[0][0] - 3.0, by = PALACE[0][1] - 5.2;
      extra.push([[bx + 3.0, by + 5.82], [bx + 3.0, by + 5.2], [bx + 3.0, by + 3.8], [bx + 3.0, by + 3.0]]);
      extra.push([[bx + 0.9, by + 5.82], [bx + 0.9, by + 4.9], [bx + 3.0, by + 4.9], [bx + 5.1, by + 4.9], [bx + 5.1, by + 5.82]]);
    }
    if (HANOK.length) extra.push(HANOK.slice());
    extra.concat(crossings).forEach(function (path) {
      path.forEach(function (q) { if (q.length === 2 && typeof q[0] === 'number') junction(q[0], q[1]); });
    });
    LINES.forEach(function (L) {
      var ps = L.pts.slice().sort(function (p, q) { return p - q; });
      gpath(ps.map(function (p) { return L.axis === 'x' ? [p, L.c] : [L.c, p]; }));
    });
    extra.forEach(function (path) { gpath(path); });
    crossings.forEach(function (cr) { gpath([cr[0], cr[1]], cr[2]); });
  }

  var SHIRTS = {
    spring: ['#f2a7c0', '#fbfbf7', '#9cc7e8', '#f6d877', '#b8dba0', '#3b4a6b', '#e9e4d7'],
    summer: ['#ffffff', '#9cc7e8', '#f6d877', '#f08a7a', '#7fcf9a', '#2b2f3a', '#e9e4d7'],
    autumn: ['#c9a273', '#2f3e5c', '#2b2b30', '#f2f2ee', '#b94a4a', '#d9a43a', '#7d8590', '#6f7a45'],
    winter: ['#2b2b30', '#3d4a66', '#8b3a3a', '#e8e4dc', '#55606e', '#2f5a4a', '#c9a273']
  };
  var HAIR = ['#2a211c', '#3d2c22', '#1f1b19', '#4a3426', '#2a211c', '#6b4a33'];
  var SKIN = ['#f3cfae', '#ebbf98', '#f6d8bb'];
  var HANBOK = [['#f6f0e6', '#f28bb0'], ['#fff6c8', '#3fb6a8'], ['#e7f3ff', '#d9483b'], ['#f6f0e6', '#7a6bd6']];
  function Person(o) {
    this.shirt = pick(Math.random, SHIRTS[SEASON]);
    this.pants = pick(Math.random, ['#2b2f3a', '#3e4a66', '#c9c2b0', '#30302f', '#5a6170']);
    this.hair = pick(Math.random, HAIR);
    this.skin = pick(Math.random, SKIN);
    this.hanbok = o && o.hanbok ? pick(Math.random, HANBOK) : null;
    this.t = Math.random() * 10;
    this.z = 0;
  }
  function drawPerson(p, x, y, me, walking, facing, flip) {
    var f = walking ? (Math.floor(me.t * 7) & 1) : 0, sh = me.hanbok ? me.hanbok[0] : me.shirt;
    p.rect(x - 1, y, 4, 1, 'rgba(30,25,40,0.18)');
    if (me.hanbok) {
      p.rect(x - 1, y - 3, 4, 3, me.hanbok[1]); p.rect(x + 2, y - 3, 1, 3, dk(me.hanbok[1], 0.2));
      p.rect(x - 1, y - 5, 3, 2, sh);
    } else {
      if (f) { p.rect(x, y - 2, 1, 2, me.pants); } else { p.rect(x - 1, y - 2, 1, 2, me.pants); p.rect(x + 1, y - 2, 1, 2, me.pants); }
      p.rect(x - 1, y - 5, 3, 3, sh); p.rect(x + 1, y - 5, 1, 3, dk(sh, 0.18));
    }
    p.rect(x - 1, y - 8, 3, 3, me.skin);
    if (facing === 'up') { p.rect(x - 1, y - 8, 3, 2, me.hair); p.rect(x - 1, y - 6, 3, 1, dk(me.hair, 0.1)); }
    else { p.rect(x - 1, y - 8, 3, 1, me.hair); p.px(flip ? x + 1 : x - 1, y - 7, me.hair); }
  }

  function Walker(node, o) {
    Person.call(this, o);
    this.at = node; this.edge = null; this.prev = null; this.pause = rnd(0, 2);
    this.speed = rnd(0.32, 0.46);
    var n = G.nodes[node]; this.ax = n[0]; this.ay = n[1]; this.facing = 'down'; this.flip = false;
  }
  Walker.prototype.update = function (dt) {
    this.t += dt;
    if (this.pause > 0) { this.pause -= dt; this.walking = false; return; }
    if (!this.edge) {
      var opts = G.adj[this.at], self = this;
      var choices = opts.filter(function (e) { return e !== self.prev; });
      if (!choices.length) choices = opts;
      if (!choices.length) return;
      var e = pick(Math.random, choices);
      if (e.cross && !SIG[e.cross.sig].walk(e.cross.axis)) {
        // wait at the crosswalk, or occasionally pick another way
        if (Math.random() < 0.3) { var alt = choices.filter(function (q) { return !q.cross; }); if (alt.length) e = pick(Math.random, alt); else { this.pause = 0.5; this.walking = false; return; } }
        else { this.pause = 0.5; this.walking = false; return; }
      }
      this.edge = e; this.from = this.at; this.to = e.a === this.at ? e.b : e.a; this.prog = 0;
      var A = G.nodes[this.from], B = G.nodes[this.to];
      this.len = Math.sqrt((A[0] - B[0]) * (A[0] - B[0]) + (A[1] - B[1]) * (A[1] - B[1])) || 0.01;
      var sdx = (B[0] - A[0]) - (B[1] - A[1]), sdy = (B[0] - A[0]) + (B[1] - A[1]);
      this.facing = sdy >= 0 ? 'down' : 'up'; this.flip = sdx > 0;
    }
    this.walking = true;
    this.prog += this.speed * dt;
    var a = G.nodes[this.from], b = G.nodes[this.to], t = Math.min(1, this.prog / this.len);
    this.ax = a[0] + (b[0] - a[0]) * t; this.ay = a[1] + (b[1] - a[1]) * t;
    if (t >= 1) { this.prev = this.edge; this.at = this.to; this.edge = null; if (Math.random() < 0.08) this.pause = rnd(1, 3.5); }
  };
  Walker.prototype.box = function () { var o = P(this.ax, this.ay, this.z); return [o[0] - 2, o[1] - 9, o[0] + 3, o[1] + 1]; };
  Walker.prototype.draw = function (ctx) { var o = P(this.ax, this.ay, this.z); drawPerson(new Painter(ctx), o[0], o[1], this, this.walking, this.facing, this.flip); };

  // People sitting in the park or at the street-food tents.
  function Sitter(x, y, o) { Person.call(this, o); this.ax = x; this.ay = y; this.facing = Math.random() < 0.5 ? 'down' : 'up'; }
  Sitter.prototype.update = function (dt) { this.t += dt; };
  Sitter.prototype.box = Walker.prototype.box;
  Sitter.prototype.draw = function (ctx) {
    var p = new Painter(ctx), o = P(this.ax, this.ay, 0), x = o[0], y = o[1];
    p.rect(x - 1, y, 4, 1, 'rgba(30,25,40,0.18)');
    p.rect(x - 1, y - 1, 3, 1, this.pants); p.rect(x - 1, y - 4, 3, 3, this.shirt); p.rect(x + 1, y - 4, 1, 3, dk(this.shirt, 0.18));
    p.rect(x - 1, y - 7, 3, 3, this.skin);
    if (this.facing === 'up') p.rect(x - 1, y - 7, 3, 2, this.hair); else p.rect(x - 1, y - 7, 3, 1, this.hair);
  };
  function Mat(x, y, c) { this.ax = x; this.ay = y; this.c = c; this.z = 0; }
  Mat.prototype.update = function () {};
  Mat.prototype.box = function () { var o = P(this.ax, this.ay, 0); return [o[0] - 7, o[1] - 4, o[0] + 7, o[1] + 4]; };
  Mat.prototype.draw = function (ctx) {
    var p = new Painter(ctx), x = this.ax, y = this.ay;
    p.poly([P(x - 0.35, y - 0.3), P(x + 0.35, y - 0.3), P(x + 0.35, y + 0.3), P(x - 0.35, y + 0.3)], this.c);
    var a = P(x - 0.35, y), b = P(x + 0.35, y);
    p.line(a[0], a[1], b[0], b[1], '#ffffff');
  };

  // Cyclists on the riverside bike paths (Seoul public bikes).
  function Cyclist(c, x0, x1, dir) {
    Person.call(this);
    this.c = c; this.x0 = x0; this.x1 = x1; this.dir = dir; this.s = dir > 0 ? x0 - 0.3 : x1 + 0.3; this.v = rnd(0.7, 1.0);
    this.label = 'Ttareungyi (Seoul public bike)';
  }
  Cyclist.prototype.update = function (dt) {
    this.t += dt; this.s += this.dir * this.v * dt; this.ax = this.s; this.ay = this.c;
    this.alpha = fadeIn(this.s, this.x0 - 0.2, this.x1 + 0.2);
    if (this.s < this.x0 - 0.6 || this.s > this.x1 + 0.6) this.dead = true;
  };
  Cyclist.prototype.box = function () { var o = P(this.ax, this.ay, 0); return [o[0] - 4, o[1] - 10, o[0] + 4, o[1] + 1]; };
  Cyclist.prototype.draw = function (ctx) {
    if (this.alpha <= 0) return;
    var p = new Painter(ctx), o = P(this.ax, this.ay, 0), x = o[0], y = o[1], f = Math.floor(this.t * 6) & 1;
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    p.rect(x - 3, y, 7, 1, 'rgba(30,25,40,0.18)');
    p.rect(x - 3, y - 2, 2, 2, '#3a3a40'); p.rect(x + 2, y - 2, 2, 2, '#3a3a40');
    p.rect(x - 2, y - 3, 5, 1, '#47b35e'); p.px(x + (this.dir > 0 ? 2 : -2), y - 4, '#3a3a40');
    p.px(x + (f ? 0 : 1), y - 2, this.pants);
    p.rect(x - 1, y - 6, 3, 3, this.shirt); p.rect(x - 1, y - 9, 3, 3, this.skin); p.rect(x - 1, y - 9, 3, 1, '#ffffff');
    ctx.globalAlpha = 1;
  };

  // Traffic light heads at the two intersections.
  function SignalHead(x, y, si, axis) { this.ax = x; this.ay = y; this.si = si; this.axis = axis; this.z = 0; }
  SignalHead.prototype.update = function () {};
  SignalHead.prototype.box = function () { var o = P(this.ax, this.ay, 0); return [o[0] - 2, o[1] - 13, o[0] + 3, o[1] + 1]; };
  SignalHead.prototype.draw = function (ctx) {
    var p = new Painter(ctx), o = P(this.ax, this.ay, 0), st = SIG[this.si].car(this.axis);
    p.rect(o[0], o[1] - 11, 1, 11, '#4d505a');
    p.rect(o[0] - 1, o[1] - 13, 3, 3, '#2d2f36');
    p.px(o[0], o[1] - 12, st === 'green' ? '!#4be37a' : st === 'yellow' ? '!#ffd34a' : '!#ff4d4d');
  };

  // Banpo Bridge Moonlight Rainbow Fountain (runs in shows).
  function Fountain(side) { this.side = side; this.ax = side > 0 ? 4.05 : 1.95; this.ay = 2; this.z = 0; this.t = rnd(0, 10); this.label = 'Banpo Bridge Moonlight Rainbow Fountain'; }
  Fountain.prototype.update = function (dt) { this.t += dt; };
  Fountain.prototype.on = function () { return (this.t % 24) < 12; };
  Fountain.prototype.box = function () { var a = P(this.ax, 0, 0), b = P(this.ax + this.side * 1.4, 4, -RIVER_D); return [Math.min(a[0], b[0]) - 12, a[1] - 12, Math.max(a[0], b[0]) + 12, b[1] + 6]; };
  Fountain.prototype.draw = function (ctx) {
    if (!this.on()) return;
    var p = new Painter(ctx), RB = ['#ff6b6b', '#ffb36b', '#ffe66b', '#7dff8f', '#6bd1ff', '#8f7dff', '#e07dff'];
    for (var j = 0; j < 22; j++) {
      var gy = 0.15 + j * 0.17, ph = (this.t * 0.9 + j * 0.13) % 1;
      if (this.ax + gy < 0) continue;
      for (var k = 0; k < 6; k++) {
        var tt = (ph + k / 6) % 1, out = tt * 1.15, z = -1 + tt * 5.5 - tt * tt * 9.5;
        if (z < -RIVER_D) continue;
        var q = P(this.ax + this.side * out, gy, z), c = NIGHT ? '!' + RB[(j + Math.floor(this.t * 2)) % RB.length] : (k & 1 ? '#e8f6ff' : '#bfe4f7');
        p.px(q[0], q[1], c);
      }
    }
  };

  // ---------------------------------------------------------------- overlay effects
  function glowAt(ctx, o, r, c) {
    var g = ctx.createRadialGradient(o[0] + 0.5, o[1] + 0.5, 0, o[0] + 0.5, o[1] + 0.5, r);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g; ctx.fillRect(o[0] - r, o[1] - r, r * 2 + 1, r * 2 + 1);
  }
  // Namsan cable car
  function drawCable(ctx, time) {
    if (!CABLE.on) return;
    var p = new Painter(ctx);
    [0, 1].forEach(function (k) {
      var off = k ? 0.12 : -0.12, A = P(CABLE.a[0] + off, CABLE.a[1] - off, CABLE.a[2] + 3), B = P(CABLE.b[0] + off, CABLE.b[1] - off, CABLE.b[2] + 3);
      p.line(A[0], A[1], B[0], B[1], '#5a5560');
      var ph = ((time / 14) + k * 0.5) % 1, tt = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      tt = Math.max(0, Math.min(1, (tt - 0.06) / 0.88));
      var x = Math.round(A[0] + (B[0] - A[0]) * tt), y = Math.round(A[1] + (B[1] - A[1]) * tt);
      p.rect(x, y, 1, 2, '#5a5560');
      p.rect(x - 2, y + 2, 5, 4, OL); p.rect(x - 1, y + 3, 3, 2, k ? '#e85d4a' : '#f2c14e'); p.px(x - 1, y + 3, NIGHT ? '!#ffe8b0' : '#cfe6f2');
    });
  }
  // Magpies, Korea's national bird, cross the sky now and then (screen coordinates).
  var birds = [];
  function updateBirds(dt) {
    if (Math.random() < dt * 0.05 && birds.length < 3) birds.push({ x: -10, y: rnd(26, 60), v: rnd(14, 20), t: 0 });
    birds.forEach(function (b) { b.x += b.v * dt; b.t += dt; b.y += Math.sin(b.t * 2) * dt * 3; });
    birds = birds.filter(function (b) { return b.x < W + 10; });
  }
  function drawBirds(ctx) {
    var p = new Painter(ctx);
    birds.forEach(function (b) {
      var x = Math.round(b.x), y = Math.round(b.y), f = Math.floor(b.t * 5) & 1;
      p.rect(x, y, 3, 1, '#20232b'); p.px(x + 1, y + 1, '#ffffff'); p.px(x - 1, y, '#20232b');
      if (f) { p.px(x, y - 1, '#20232b'); p.px(x - 1, y - 2, '#20232b'); } else { p.px(x, y + 1, '#20232b'); p.px(x - 1, y + 2, '#20232b'); }
    });
  }
  // Airliners crossing high above the city, with contrails and night navigation lights
  // (screen coordinates). Sprite faces right; x offsets are mirrored for planes flying left.
  var PLANE = [
    // [x, y, colour key]: f fuselage, w window row, b belly, t tail, g wing, e engine
    [-15, -6, 't'], [-14, -6, 't'], [-15, -5, 't'], [-14, -5, 't'], [-13, -5, 't'], [-15, -4, 't'], [-14, -4, 't'], [-13, -4, 't'], [-12, -4, 't'],
    [-15, -3, 'f'], [-14, -3, 'f'], [-13, -3, 'f'], [-12, -3, 'f'], [-11, -3, 'f'], [-10, -3, 'f'], [-9, -3, 'f'], [-8, -3, 'f'], [-7, -3, 'f'], [-6, -3, 'f'], [-5, -3, 'f'], [-4, -3, 'f'], [-3, -3, 'f'],
    [-16, -2, 'f'], [-15, -2, 'f'], [-14, -2, 'w'], [-13, -2, 'f'], [-12, -2, 'w'], [-11, -2, 'f'], [-10, -2, 'w'], [-9, -2, 'f'], [-8, -2, 'w'], [-7, -2, 'f'], [-6, -2, 'w'], [-5, -2, 'f'], [-4, -2, 'w'], [-3, -2, 'f'], [-2, -2, 'w'], [-1, -2, 'f'],
    [-17, -1, 'f'], [-16, -1, 'f'], [-15, -1, 'b'], [-14, -1, 'b'], [-13, -1, 'b'], [-12, -1, 'b'], [-11, -1, 'b'], [-10, -1, 'b'], [-9, -1, 'b'], [-8, -1, 'b'], [-7, -1, 'b'], [-6, -1, 'b'], [-5, -1, 'b'], [-4, -1, 'b'], [-3, -1, 'b'], [-2, -1, 'b'], [-1, -1, 'b'], [0, -1, 'b'],
    [-9, 0, 'g'], [-8, 0, 'e'], [-7, 0, 'e'], [-10, 1, 'g'], [-11, 1, 'g'], [-12, 2, 'g']
  ];
  var PCOL = { f: '#f6f8fa', w: '#5f7fa6', b: '#c7d2dc', t: '#3b82c4', g: '#aab6c2', e: '#7f8b97' };
  var planes = [], planeT = 5;
  function updatePlanes(dt) {
    planeT -= dt;
    if (planeT <= 0 && planes.length < 2) {
      var dir = Math.random() < 0.5 ? 1 : -1;
      planes.push({ x: dir > 0 ? -30 : W + 30, y: rnd(10, 34), dir: dir, v: rnd(9, 14), climb: rnd(-0.6, 0.6), t: 0 });
      planeT = rnd(16, 32);
    }
    planes.forEach(function (p) { p.x += p.dir * p.v * dt; p.y += p.climb * dt; p.t += dt; });
    planes = planes.filter(function (p) { return p.dir > 0 ? p.x < W + 120 : p.x > -120; });
  }
  function drawPlanes(ctx) {
    var p = new Painter(ctx);
    planes.forEach(function (pl) {
      var x = Math.round(pl.x), y = Math.round(pl.y), d = pl.dir;
      // contrails: two thin trails that fade with distance
      for (var k = 0; k < 70; k++) {
        var a = 0.5 * (1 - k / 70);
        if (a <= 0.02) break;
        ctx.globalAlpha = a;
        p.px(x - d * (17 + k), y - 2 + (k > 40 ? 1 : 0), NIGHT ? '#8a96b8' : '#c3ccd6');
        p.px(x - d * (14 + k), y + 1 + (k > 30 ? 1 : 0), NIGHT ? '#8a96b8' : '#c3ccd6');
      }
      ctx.globalAlpha = 1;
      PLANE.forEach(function (q) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) { p.px(x + d * q[0] + o[0], y + q[1] + o[1], OL); }); });
      PLANE.forEach(function (q) { p.px(x + d * q[0], y + q[1], PCOL[q[2]]); });
      if (NIGHT) {
        var blink = Math.floor(pl.t * 2) & 1;
        p.px(x - d * 12, y + 2, d > 0 ? '!#ff3b3b' : '!#3bff6a');
        if (blink) { p.px(x - d * 15, y - 6, '!#ffffff'); p.px(x - d * 2, y, '!#ff3b3b'); }
      }
    });
  }
  // Water sparkle
  function drawSparkles(ctx, time, x0, x1) {
    if (!waterPixels.length) return;
    var p = new Painter(ctx), n = waterPixels.length / 2, slot = Math.floor(time * 3);
    for (var k = 0; k < 60; k++) {
      var i = Math.floor(hash(k, slot, 77) * n), x = waterPixels[i * 2], y = waterPixels[i * 2 + 1];
      if (x >= x0 && x <= x1) p.rect(x, y, 2, 1, NIGHT ? '#9fb7d8' : '#d8f0fb');
    }
  }

  // ---------------------------------------------------------------- speech bubbles
  var ICONS = {
    coffee: ['.k.k..', '......', 'bbbb..', 'bbbbkk', 'bbbb.k', '.bb...'],
    heart: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'],
    note: ['..kkk', '..k.k', '..k.k', 'kkk.k', 'kk...'],
    idea: ['.yyy.', 'yyyyy', 'yyyyy', '.yyy.', '.kkk.'],
    ramen: ['k.k.k', 'oooooo', 'roooor', '.rrrr.'],
    camera: ['.kk..', 'kkkkk', 'kuuuk', 'kuuuk', 'kkkkk'],
    book: ['uu.uu', 'uwuwu', 'uwuwu', 'uuuuu'],
    chat: ['.....', 'k.k.k', '.....'],
    leaf: ['..oo', '.ooo', 'ooo.', 'k...'],
    star: ['..y..', 'yyyyy', '.yyy.', 'y...y']
  };
  var ICOL = { k: '#3a3442', b: '#8a5a3a', r: '#e2465b', y: '#f2b632', o: '#f08a3a', u: '#6aa8e0', w: '#ffffff' };
  var ICON_KEYS = Object.keys(ICONS);
  var bubbles = [];
  function drawBubble(ctx, a, icon, age) {
    var o = P(a.ax, a.ay, a.z || 0), bmp = ICONS[icon], bw = 0, bh = bmp.length;
    bmp.forEach(function (r) { bw = Math.max(bw, r.length); });
    var w = bw + 4, h = bh + 4, x = o[0] - Math.floor(w / 2) + 1, y = o[1] - 12 - h;
    if (age < 0.12) { y += 2; }
    var p = new Painter(ctx);
    p.rect(x + 1, y, w - 2, h, OL); p.rect(x, y + 1, w, h - 2, OL);
    p.rect(x + 1, y + 1, w - 2, h - 2, '!#ffffff');
    p.rect(x + 2, y + h, 2, 1, OL); p.px(x + 2, y + h + 1, OL); p.px(x + 3, y + h - 1, '!#ffffff'); p.px(x + 2, y + h - 1, '!#ffffff');
    bmp.forEach(function (row, ry) {
      for (var rx = 0; rx < row.length; rx++) if (row[rx] !== '.') p.px(x + 2 + rx + Math.floor((bw - row.length) / 2), y + 2 + ry, '!' + ICOL[row[rx]]);
    });
  }
  function updateBubbles(dt) {
    bubbles.forEach(function (b) { b.age += dt; });
    bubbles = bubbles.filter(function (b) { return b.age < b.life && !b.a.dead; });
    if (bubbles.length < 5 && Math.random() < dt * 1.1) {
      var cands = agents.filter(function (a) { return (a instanceof Walker || a instanceof Sitter) && !bubbles.some(function (b) { return b.a === a; }); });
      if (cands.length) {
        var a = pick(Math.random, cands), icon;
        if (a.hanbok) icon = pick(Math.random, ['camera', 'heart', 'star']);
        else if (a instanceof Sitter) icon = pick(Math.random, ['ramen', 'chat', 'note', 'heart', 'star']);
        else icon = pick(Math.random, ICON_KEYS.concat(SEASON === 'autumn' ? ['leaf', 'leaf'] : []));
        bubbles.push({ a: a, icon: icon, age: 0, life: rnd(2.4, 3.6) });
      }
    }
  }

  // ---------------------------------------------------------------- world setup
  var ground, spawnT = { train: 3, boat: 2, bike: 1 }, trainDir = 1, boatDir = 1, trains = [];
  function setupAgents() {
    agents = []; trains = []; bubbles = [];
    SIG = {};
    ROADS_B.forEach(function (a) { if (a !== 0 && ROADS_A.indexOf(-a) >= 0) SIG[a] = new Signal(); });
    buildLanes();
    buildGraph();
    var i, nWalk = Math.round((UMAX - UMIN) * 0.3);
    for (i = 0; i < nWalk; i++) agents.push(new Walker(Math.floor(Math.random() * G.nodes.length)));
    if (PALACE.length) {
      var pn = PALACE.map(function (q) { return gnode(q[0], q[1] + (q[1] === PALACE[0][1] ? 0 : 0)); });
      for (i = 0; i < 6; i++) agents.push(new Walker(pn[i % pn.length], { hanbok: true }));
    }
    MATS.forEach(function (q) { agents.unshift(new Mat(q[0], q[1], q[2])); });
    SITTERS.forEach(function (q) { agents.push(new Sitter(q[0], q[1])); });
    Object.keys(SIG).forEach(function (k) {
      var a = +k, x0 = 8 * a + 2, y0 = -8 * a + 1;
      agents.push(new SignalHead(x0 - 0.3, y0 - 0.3, a, 'y'), new SignalHead(x0 + 2.3, y0 + 2.3, a, 'x'));
    });
    agents.push(new Fountain(1), new Fountain(-1));
    SWANS.forEach(function (q) { agents.push(new Swan(q[0], q[1], q[2], q[3], q[4])); agents.push(new Swan(q[0], q[1], q[2], q[3], q[4])); });
    // pre-warm traffic so the city starts busy
    LANES.forEach(function (l) {
      for (var s = l.lo + rnd(0.5, 4); s < l.hi - 0.5; s += rnd(5, 9)) {
        var c = new Car(l); c.s = s; c.pos(); l.cars.push(c); agents.push(c);
      }
    });
    agents.push(new Boat(1));
    var b = new Boat(-1); b.s = 4; agents.push(b);
    BIKES.forEach(function (q) { agents.push(new Cyclist(q[0], q[1], q[2], Math.random() < 0.5 ? 1 : -1)); });
  }
  function spawn(dt) {
    LANES.forEach(function (l) {
      l.timer -= dt;
      if (l.timer > 0) return;
      l.timer = rnd(4, 9);
      var entry = l.dir > 0 ? l.lo : l.hi, clear = l.cars.every(function (c) { return Math.abs(c.s - entry) > 1.8; });
      if (clear) { var c = new Car(l); l.cars.push(c); agents.push(c); }
    });
    spawnT.train -= dt;
    if (spawnT.train <= 0 && !trains.length) {
      var tr = new Train(trainDir); trainDir = -trainDir;
      trains.push(tr);
      for (var k = 0; k < tr.cars; k++) agents.push(new TrainCar(tr, k));
      spawnT.train = rnd(5, 9);
    }
    spawnT.boat -= dt;
    if (spawnT.boat <= 0) { agents.push(new Boat(boatDir)); boatDir = -boatDir; spawnT.boat = rnd(14, 24); }
    spawnT.bike -= dt;
    if (spawnT.bike <= 0 && BIKES.length) {
      var o = pick(Math.random, BIKES);
      agents.push(new Cyclist(o[0], o[1], o[2], Math.random() < 0.5 ? 1 : -1));
      spawnT.bike = rnd(4, 8);
    }
  }

  // ---------------------------------------------------------------- frame
  var SCALE = 2, camX = 0;
  var canvas = document.createElement('canvas');
  canvas.className = 'seoul-band__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'An animated pixel-art panorama of Seoul along the bottom of the page: apartment blocks, Lotte World Tower, the Han River with Banpo Bridge and a Line 2 train, Myeongdong, Gyeongbokgung Palace, N Seoul Tower on Namsan and a hanok village, with cars, buses and people moving through the streets.');
  var ctx = canvas.getContext('2d');

  function inFrontA(a, s) {
    if (a.ax >= s.x1 || a.ay >= s.y1) return true;
    if (a.ax < s.x0 || a.ay < s.y0) return false;
    return (a.z || 0) >= s.top;
  }
  var time = 0;
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    var vx0 = -camX - 24, vx1 = -camX + W + 24, i, k;
    ctx.translate(camX, 0);
    ctx.drawImage(ground, 0, 0);
    drawSparkles(ctx, time, vx0, vx1);
    var vis = [];
    for (k = 0; k < order.length; k++) if (order[k].bx1 > vx0 && order[k].bx0 < vx1) vis.push(k);
    var buckets = {};
    for (i = 0; i < agents.length; i++) {
      var a = agents[i], bx = a.box(), ins = -1;
      a._b = bx;
      if (bx[2] < vx0 || bx[0] > vx1) { a._vis = false; continue; }
      a._vis = true;
      for (var j = 0; j < vis.length; j++) {
        var s = order[vis[j]];
        if (s.bx0 < bx[2] && bx[0] < s.bx1 && s.by0 < bx[3] && bx[1] < s.by1 && inFrontA(a, s)) ins = vis[j];
      }
      (buckets[ins] || (buckets[ins] = [])).push(a);
    }
    var drawBucket = function (list) {
      if (!list) return;
      list.sort(function (p, q) { return (p.ax + p.ay) - (q.ax + q.ay) || (p.z || 0) - (q.z || 0); });
      for (var m = 0; m < list.length; m++) list[m].draw(ctx);
    };
    drawBucket(buckets[-1]);
    for (j = 0; j < vis.length; j++) { var st = order[vis[j]]; ctx.drawImage(st.cv, st.bx0, st.by0); drawBucket(buckets[vis[j]]); }
    drawCable(ctx, time);
    if (NIGHT) {
      ctx.globalCompositeOperation = 'lighter';
      lamps.forEach(function (l) { var q = P(l[0], l[1], 9); if (q[0] > vx0 && q[0] < vx1) glowAt(ctx, q, 9, 'rgba(255,214,140,0.28)'); });
      agents.forEach(function (a) { if (a._vis && a instanceof Car) a.glow(ctx); });
      if (CABLE.on) glowAt(ctx, P(TOWER.x, TOWER.y, TOWER.z + 6 + TOWER_SHAFT + 2), 18, 'rgba(140,170,255,0.18)');
      ctx.globalCompositeOperation = 'source-over';
      if (CABLE.on && (Math.floor(time * 1.5) & 1)) { var tip = P(TOWER.x, TOWER.y, TOWER.z + 6 + TOWER_SHAFT + 16 + TOWER_MAST); ctx.fillStyle = '#ff4040'; ctx.fillRect(tip[0], tip[1], 1, 1); }
    }
    bubbles.forEach(function (b) { if (b.a._vis) drawBubble(ctx, b.a, b.icon, b.age); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBirds(ctx);
    drawPlanes(ctx);
  }
  function step(dt) {
    time += dt;
    Object.keys(SIG).forEach(function (k) { SIG[k].update(dt); });
    spawn(dt);
    trains.forEach(function (t) { t.update(dt); });
    trains = trains.filter(function (t) { return !t.dead; });
    for (var i = 0; i < agents.length; i++) agents[i].update(dt);
    agents = agents.filter(function (a) { return !a.dead; });
    LANES.forEach(function (l) { l.cars = l.cars.filter(function (c) { return !c.dead; }); });
    updateBubbles(dt);
    updateBirds(dt);
    updatePlanes(dt);
  }

  // ---------------------------------------------------------------- setup, sizing, loop
  function build() {
    nightCache = {};
    spriteCache = {};
    buildCity();
    ground = buildGround();
    prerenderAll();
  }
  build();
  setupAgents();
  for (var warm = 0; warm < 40; warm++) step(0.1);

  var scene = host.querySelector('.seoul-band__scene') || host;
  scene.appendChild(canvas);
  var tip = document.querySelector('[data-seoul-tip]');
  var root = document.documentElement;

  function fit() {
    var vw = document.documentElement.clientWidth || window.innerWidth, dpr = window.devicePixelRatio || 1;
    SCALE = vw >= 1000 ? 2 : (dpr >= 2 ? 1.5 : 1);
    W = Math.min(GW, Math.ceil(vw / SCALE) + 1);
    canvas.width = W; canvas.height = H;
    canvas.style.width = (W * SCALE) + 'px';
    canvas.style.height = (H * SCALE) + 'px';
    camX = Math.round(W / 2 - (OX + CENTER_U * HW));
    root.style.setProperty('--seoul-height', (H * SCALE) + 'px');
    root.style.setProperty('--seoul-horizon', (HEAD * SCALE) + 'px');
    setGround();
    render();
  }
  function setGround() {
    // room for the ground plus the low skyline, so the footer text clears the buildings
    root.style.setProperty('--seoul-ground', collapsed ? '0px' : ((VB * HH + 48) * SCALE) + 'px');
  }
  var collapsed = false;
  try { collapsed = window.localStorage.getItem('seoul-hidden') === '1'; } catch (e) { collapsed = false; }
  var toggle = document.querySelector('[data-seoul-toggle]');
  function applyCollapsed() {
    host.classList.toggle('is-collapsed', collapsed);
    document.body.classList.add('has-seoul');
    if (toggle) {
      toggle.textContent = collapsed ? 'Show Seoul' : 'Hide';
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'Show the Seoul city strip' : 'Hide the Seoul city strip');
    }
    setGround();
    window.dispatchEvent(new Event('resize'));
  }
  if (toggle) toggle.addEventListener('click', function () {
    collapsed = !collapsed;
    try { window.localStorage.setItem('seoul-hidden', collapsed ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    applyCollapsed();
  });
  var lastW = 0;
  window.addEventListener('resize', function () {
    var vw = document.documentElement.clientWidth || window.innerWidth;
    if (vw !== lastW) { lastW = vw; fit(); }
  });
  lastW = document.documentElement.clientWidth || window.innerWidth;
  fit();
  applyCollapsed();

  // Hover labels for landmarks and vehicles. The strip itself ignores the pointer so the
  // page underneath stays clickable; hits are computed from window coordinates instead.
  function hitTest(mx, my) {
    for (var k = order.length - 1; k >= 0; k--) {
      var s = order[k];
      if (!s.label || mx < s.bx0 || my < s.by0 || mx >= s.bx1 || my >= s.by1) continue;
      if (!s.alpha) {
        var id = s.cv.getContext('2d').getImageData(0, 0, s.cv.width, s.cv.height).data, a = new Uint8Array(s.cv.width * s.cv.height);
        for (var i = 0; i < a.length; i++) a[i] = id[i * 4 + 3];
        s.alpha = a;
      }
      if (s.alpha[(my - s.by0) * s.cv.width + (mx - s.bx0)] > 0) return s.label;
    }
    return null;
  }
  function hideTip() { if (tip) tip.classList.remove('is-on'); }
  function onPoint(ev) {
    if (!tip || collapsed) return;
    var r = canvas.getBoundingClientRect();
    if (ev.clientY < r.top || ev.clientY >= r.bottom || ev.clientX < r.left || ev.clientX >= r.right) { hideTip(); return; }
    var mx = Math.floor((ev.clientX - r.left) / SCALE) - camX, my = Math.floor((ev.clientY - r.top) / SCALE);
    var label = null;
    agents.forEach(function (a) { if (a.label && a._vis && a._b && (a.alpha == null || a.alpha > 0.5) && mx >= a._b[0] && mx < a._b[2] && my >= a._b[1] && my < a._b[3]) label = a.label; });
    label = label || hitTest(mx, my);
    if (label) {
      tip.textContent = label;
      tip.style.left = ev.clientX + 'px';
      tip.style.top = ev.clientY + 'px';
      tip.classList.add('is-on');
    } else hideTip();
  }
  window.addEventListener('pointermove', onPoint, { passive: true });
  window.addEventListener('pointerdown', onPoint, { passive: true });
  window.addEventListener('scroll', hideTip, { passive: true });

  // Clock (KST).
  var clock = document.querySelector('[data-seoul-clock]');
  function updateClock() {
    var k = kst(), hh = (k.h < 10 ? '0' : '') + k.h, mm = (k.m < 10 ? '0' : '') + k.m;
    if (clock) clock.textContent = hh + ':' + mm + ' KST';
  }
  updateClock();
  setInterval(updateClock, 30000);

  // Day in the light theme, night in the dark theme; follows the theme toggle live.
  function setNight(n) {
    if (n === NIGHT) return;
    NIGHT = n;
    build();
    agents.forEach(function (a) { if (a.kind) a.spr = sprite(a.kind, a.lane.axis, a.lane.dir, a.ci); if (a instanceof TrainCar) a.spr = sprite('train', 'y', a.train.dir, 0); if (a instanceof Boat) a.spr = sprite('boat', 'x', a.dir, 0); });
    trains.forEach(function (t) { t.spr = sprite('train', 'y', t.dir, 0); });
    render();
  }
  if (!FORCE_TIME && 'MutationObserver' in window) {
    new MutationObserver(function () { setNight(themeDark()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var last = 0, acc = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden || collapsed) { last = ts; return; }
    var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts; acc += dt;
    if (acc < 1 / 30) return;
    step(acc); render(); acc = 0;
  }
  render();
  if (!reduce) requestAnimationFrame(loop);
})();
