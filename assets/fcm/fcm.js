/* Interactive figures for the "Beyond Adjacent Layers" project page.
 * All numbers are copied from the camera-ready paper (Tables 2, 4, 5 and 6).
 * The CKA matrices in cka.json are the released profiling outputs, floored to
 * three decimals so that counts at any 0.01 threshold are exact. */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var MINUS = "−";

  // ---------------------------------------------------------------- data

  // Table 2: L, adjacent and non-adjacent pairs with CKA >= 0.8, ratio.
  var RATIOS = [
    { m: "SmolLM3-3B", L: 36, adj: 35, na: 555, r: 15.9 },
    { m: "LLaMA-3.1-8B", L: 32, adj: 31, na: 376, r: 12.1 },
    { m: "LLaMA-3.2-3B", L: 28, adj: 27, na: 327, r: 12.1 },
    { m: "Gemma-2-2B", L: 26, adj: 25, na: 300, r: 12.0 },
    { m: "StableLM-2-1.6B", L: 24, adj: 23, na: 236, r: 10.3 },
    { m: "Qwen2.5-3B", L: 36, adj: 34, na: 336, r: 9.9 },
    { m: "Mistral-7B", L: 32, adj: 30, na: 182, r: 6.1 },
    { m: "Qwen3-1.7B", L: 28, adj: 25, na: 138, r: 5.5 },
    { m: "Qwen2.5-7B", L: 28, adj: 26, na: 125, r: 4.8 },
    { m: "Qwen2.5-14B", L: 48, adj: 46, na: 200, r: 4.35, noMatrix: true },
    { m: "Qwen3-14B", L: 40, adj: 37, na: 158, r: 4.27, noMatrix: true },
    { m: "Qwen3-8B", L: 36, adj: 32, na: 128, r: 4.0 },
    { m: "Qwen3-4B", L: 36, adj: 32, na: 114, r: 3.6 }
  ];

  var METHODS = [
    { key: "fcm", name: "FCM (ours)", color: "var(--s-fcm)", shape: "circle" },
    { key: "delta", name: "DeltaLLM", color: "var(--s-delta)", shape: "circle" },
    { key: "short", name: "ShortGPT", color: "var(--s-short)", shape: "circle" },
    { key: "flat", name: "FlattenGPT", color: "var(--s-neutral)", shape: "diamond" },
    { key: "swm", name: "SWM", color: "var(--s-neutral)", shape: "triangle" }
  ];

  // Table 4: WikiText-2 PPL at 2x, mean and std over 3 seeds. d: FCM vs best baseline.
  var H2H = [
    { m: "StableLM-2-1.6B", short: [52.60, 2.40], flat: [48.90, 2.10], swm: [51.20, 2.80], delta: [44.10, 1.80], fcm: [33.24, 1.10], d: "-24.6%" },
    { m: "Qwen3-1.7B", short: [74.20, 3.10], flat: [64.50, 2.90], swm: [71.10, 3.80], delta: [58.60, 2.40], fcm: [46.45, 1.80], d: "-20.7%" },
    { m: "Gemma-2-2B", short: [68.40, 2.90], flat: [63.10, 2.40], swm: [66.80, 3.10], delta: [61.20, 2.10], fcm: [54.58, 1.65], d: "-10.8%" },
    { m: "Qwen2.5-3B", short: [48.50, 2.10], flat: [44.20, 1.90], swm: [46.80, 2.30], delta: [42.10, 1.65], fcm: [35.40, 1.20], d: "-15.9%" },
    { m: "LLaMA-3.2-3B", short: [55.36, 2.12], flat: [58.20, 2.30], swm: [61.10, 3.40], delta: [54.80, 1.95], fcm: [52.60, 1.85], d: "-4.0%", tie: true },
    { m: "SmolLM3-3B", short: [41.80, 1.65], flat: [43.20, 1.80], swm: [46.10, 2.10], delta: [40.50, 1.40], fcm: [39.85, 1.30], d: "-1.6%", tie: true },
    { m: "Qwen3-4B", short: [116.20, 8.12], flat: [92.30, 6.20], swm: [105.40, 7.80], delta: [84.50, 5.10], fcm: [58.15, 9.45], d: "-31.2%" },
    { m: "Qwen2.5-7B", short: [44.92, 2.85], flat: [38.15, 1.42], swm: [41.20, 2.15], delta: [35.60, 1.05], fcm: [26.65, 0.94], d: "-25.1%" },
    { m: "Qwen3-8B", short: [39.80, 1.90], flat: [35.40, 1.50], swm: [38.10, 2.05], delta: [33.20, 1.20], fcm: [28.45, 1.10], d: "-14.3%" },
    { m: "LLaMA-3.1-8B", short: [42.75, 1.70], flat: [40.12, 0.95], swm: [44.55, 1.88], delta: [38.25, 0.82], fcm: [35.25, 1.15], d: "-7.8%" },
    { m: "Qwen2.5-14B", short: [32.45, 1.95], flat: [29.80, 1.12], swm: [31.40, 1.45], delta: [27.95, 0.74], fcm: [24.18, 0.82], d: "-13.5%" },
    { m: "Qwen3-14B", short: [48.31, 2.41], flat: [43.50, 1.60], swm: [45.80, 1.90], delta: [41.20, 1.30], fcm: [36.85, 1.15], d: "-10.6%" },
    { m: "Mistral-7B", short: [28.36, 0.54], flat: [4962, 6775], swm: [471.5, 329], delta: [32.76, 0.55], fcm: [32.16, 1.20], d: "+13.4%", sep: true,
      note: "Full-token CKA instead of mean pooling: FCM 29.86 ± 1.87 (+5.3%)." }
  ];

  // Table 5: compression-ratio sweep, mean and std over 3 seeds.
  var SWEEP_X = [1.5, 2.0, 2.5, 3.0];
  var SWEEP = [
    { m: "Qwen2.5-7B",
      short: [[12.28, 0.35], [44.92, 2.85], [148.50, 9.20], [412.80, 28.5]],
      flat: [[12.95, 0.40], [38.15, 1.42], [112.40, 6.80], [315.60, 21.0]],
      delta: [[11.85, 0.28], [35.60, 1.05], [98.60, 5.10], [268.40, 18.2]],
      fcm: [[12.45, 0.32], [26.65, 0.94], [64.20, 3.85], [142.50, 11.4]] },
    { m: "LLaMA-3.1-8B",
      short: [[11.45, 0.28], [42.75, 1.70], [124.60, 7.80], [385.20, 24.1]],
      flat: [[12.10, 0.35], [40.12, 0.95], [105.20, 5.40], [298.50, 19.4]],
      delta: [[11.60, 0.30], [38.25, 0.82], [92.40, 4.80], [245.80, 16.5]],
      fcm: [[11.82, 0.31], [35.25, 1.15], [71.80, 4.10], [158.40, 12.1]] },
    { m: "Qwen2.5-14B",
      short: [[8.42, 0.18], [32.45, 1.95], [118.50, 8.12], [395.14, 25.4]],
      flat: [[8.95, 0.22], [29.80, 1.12], [94.20, 5.10], [284.10, 18.5]],
      delta: [[8.55, 0.20], [27.95, 0.74], [82.30, 4.55], [210.60, 15.2]],
      fcm: [[8.68, 0.19], [24.18, 0.82], [54.60, 3.10], [118.20, 8.90]] }
  ];
  var SWEEP_METHODS = METHODS.filter(function (d) { return d.key !== "swm"; });

  // ---------------------------------------------------------------- helpers

  function s(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, attrs, parent, text) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function txt(parent, x, y, str, attrs) {
    var t = s("text", Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function fmt(v) {
    if (v >= 100 && v % 1 === 0) return String(v);
    return v.toFixed(2);
  }
  function signed(str) { return str.replace("-", MINUS); }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function isDark() { return cssVar("color-scheme") === "dark"; }

  // Marker shapes: identity is carried by shape as well as color.
  function marker(parent, shape, x, y, r, color, ring) {
    var a = { style: "fill:" + color + ";stroke:" + (ring ? "var(--bg)" : "none") + ";stroke-width:2" };
    if (shape === "diamond") {
      var d = r * 1.25;
      return s("path", Object.assign({ d: "M" + x + " " + (y - d) + "L" + (x + d) + " " + y + "L" + x + " " + (y + d) + "L" + (x - d) + " " + y + "Z" }, a), parent);
    }
    if (shape === "triangle") {
      var t = r * 1.3;
      return s("path", Object.assign({ d: "M" + x + " " + (y - t) + "L" + (x + t * 0.95) + " " + (y + t * 0.7) + "L" + (x - t * 0.95) + " " + (y + t * 0.7) + "Z" }, a), parent);
    }
    return s("circle", Object.assign({ cx: x, cy: y, r: r }, a), parent);
  }
  function legendInto(container, methods) {
    container.textContent = "";
    methods.forEach(function (d) {
      var item = h("span", {}, container);
      var g = s("svg", { width: 14, height: 14, viewBox: "0 0 14 14", "aria-hidden": "true" }, item);
      marker(g, d.shape, 7, 7, 4.5, d.color, false);
      h("span", {}, item, d.name);
    });
  }

  // One shared tooltip.
  var tip = h("div", { class: "tip", role: "tooltip", hidden: "" }, document.body);
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.hidden = false;
    var pad = 14, w = tip.offsetWidth, hgt = tip.offsetHeight;
    var x = ev.pageX + pad, y = ev.pageY + pad;
    if (x + w > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - w - pad;
    if (x < window.scrollX + 8) x = window.scrollX + 8;
    if (y + hgt > window.scrollY + window.innerHeight - 8) y = ev.pageY - hgt - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideTip() { tip.hidden = true; }
  function swatch(color, shape) {
    var p = shape === "diamond" ? '<path d="M6 1L11 6L6 11L1 6Z"' :
      shape === "triangle" ? '<path d="M6 1L11 10L1 10Z"' : '<circle cx="6" cy="6" r="4.5"';
    return '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">' + p + ' style="fill:' + color + '"/></svg>';
  }
  function esc(str) { return String(str).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function logScale(d0, d1, r0, r1) {
    var l0 = Math.log(d0), l1 = Math.log(d1);
    return function (v) { return r0 + (Math.log(v) - l0) / (l1 - l0) * (r1 - r0); };
  }
  function linScale(d0, d1, r0, r1) {
    return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
  }

  // ---------------------------------------------------------------- similarity explorer

  var CKA = null;
  var state = { model: "Qwen2.5-7B", thr: 0.80, fade: false };

  // Sequential single-hue ramp (blue). Light: pale to deep. Dark: deep to pale.
  var RAMP_LIGHT = ["#f2f6fc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  var RAMP_DARK = ["#1b2230", "#13305a", "#104281", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#cde2fb"];
  function hexToRgb(x) { return [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]; }
  function rampColor(v) {
    var ramp = isDark() ? RAMP_DARK : RAMP_LIGHT;
    v = Math.max(0, Math.min(1, v));
    var p = v * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(p)), f = p - i;
    var a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
    return "rgb(" + a.map(function (c, k) { return Math.round(c + (b[k] - c) * f); }).join(",") + ")";
  }

  function counts(S, t) {
    var L = S.length, adj = 0, na = 0;
    for (var i = 0; i < L; i++) for (var j = i + 1; j < L; j++) {
      if (S[i][j] >= t) { if (j === i + 1) adj++; else na++; }
    }
    return { adj: adj, na: na };
  }

  function drawRatio() {
    var box = document.getElementById("ratio-chart");
    box.textContent = "";
    var W = box.clientWidth || 260, rowH = 24, nameW = 124, valW = 44;
    var H = RATIOS.length * rowH + 4;
    var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H }, box);
    var x = linScale(0, 16, nameW, W - valW);
    RATIOS.forEach(function (d, i) {
      var y = i * rowH + 2;
      var sel = d.m === state.model;
      var g = s("g", {
        class: "ratio-row", role: "option", tabindex: d.noMatrix ? -1 : 0,
        "aria-selected": sel ? "true" : "false", "aria-disabled": d.noMatrix ? "true" : "false",
        "aria-label": d.m + ", ratio " + d.r + (d.noMatrix ? ", matrix not available" : "")
      }, svg);
      s("rect", { class: "ratio-hit", x: 0, y: y, width: W, height: rowH - 2, rx: 3, style: "fill:" + (sel ? "var(--panel)" : "transparent") + ";stroke:none" }, g);
      txt(g, 6, y + rowH / 2 + 3, d.m, { class: "ratio-name", "font-size": 12.5 });
      var bw = Math.max(1, x(d.r) - nameW), by = y + 6, bh = rowH - 14;
      if (d.noMatrix) {
        s("rect", { x: nameW + 0.5, y: by + 0.5, width: bw - 1, height: bh - 1, rx: 2, style: "fill:none;stroke:var(--s-neutral);stroke-width:1" }, g);
      } else {
        s("rect", { x: nameW, y: by, width: bw, height: bh, rx: 2, style: "fill:" + (sel ? "var(--s-fcm)" : "var(--s-neutral)") + ";opacity:" + (sel ? 1 : 0.55) }, g);
      }
      txt(g, nameW + bw + 6, y + rowH / 2 + 3, (d.r % 1 === 0 ? d.r.toFixed(1) : String(d.r)) + "×", { "font-size": 12, style: "fill:var(--ink-2)" });
      if (!d.noMatrix) {
        var pick = function () { state.model = d.m; drawRatio(); drawHeatmap(); };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); box.querySelector('[aria-selected="true"]').focus(); }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            var rows = Array.prototype.slice.call(box.querySelectorAll('.ratio-row[aria-disabled="false"]'));
            var k = rows.indexOf(g) + (e.key === "ArrowDown" ? 1 : -1);
            if (rows[k]) rows[k].focus();
          }
        });
      }
      g.addEventListener("mousemove", function (ev) {
        showTip("<b>" + esc(d.m) + "</b> (" + d.L + " layers)<br>" + d.adj + " adjacent and " + d.na + " non-adjacent pairs at CKA ≥ 0.80" +
          (d.noMatrix ? "<br>Matrix not included on this page" : ""), ev);
      });
      g.addEventListener("mouseleave", hideTip);
    });
  }

  function drawHeatmap() {
    var box = document.getElementById("heatmap");
    box.textContent = "";
    if (!CKA) { h("p", { class: "fig-label" }, box, "Loading similarity matrices…"); return; }
    var S = CKA[state.model], L = S.length;
    var avail = box.clientWidth || 520;
    var size = Math.min(avail, 540);
    var ml = 34, mt = 6, mb = 64, mr = 6;
    var cell = (size - ml - mr) / L;
    var plot = cell * L;
    var W = ml + plot + mr, H = mt + plot + mb;
    var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "CKA similarity matrix for " + state.model + ", " + L + " layers" }, box);
    var g = s("g", { transform: "translate(" + ml + "," + mt + ")" }, svg);
    var gap = cell > 9 ? 1 : 0.5;
    for (var i = 0; i < L; i++) for (var j = 0; j < L; j++) {
      var v = S[i][j], style;
      if (i === j) style = "fill:var(--cell-self)";
      else {
        style = "fill:" + rampColor(v);
        if (state.fade && v < state.thr) style += ";opacity:0.16";
      }
      s("rect", { x: j * cell + gap / 2, y: i * cell + gap / 2, width: cell - gap, height: cell - gap, style: style }, g);
    }
    // Axis ticks every 4 layers.
    for (var k = 0; k < L; k += 4) {
      txt(g, k * cell + cell / 2, plot + 14, String(k), { "font-size": 11, "text-anchor": "middle" });
      txt(g, -6, k * cell + cell / 2 + 4, String(k), { "font-size": 11, "text-anchor": "end" });
    }
    txt(g, plot / 2, plot + 30, "Layer", { "font-size": 12, "text-anchor": "middle" });

    // Color scale.
    var defs = s("defs", {}, svg);
    var grad = s("linearGradient", { id: "ckaGrad", x1: 0, x2: 1, y1: 0, y2: 0 }, defs);
    for (var q = 0; q <= 10; q++) s("stop", { offset: q * 10 + "%", "stop-color": rampColor(q / 10) }, grad);
    var lw = Math.min(180, plot * 0.5), lx = plot - lw, ly = plot + 42;
    txt(g, lx - 8, ly + 9, "CKA 0", { "font-size": 11, "text-anchor": "end" });
    s("rect", { x: lx, y: ly, width: lw, height: 10, rx: 2, fill: "url(#ckaGrad)" }, g);
    txt(g, lx + lw + 6, ly + 9, "1", { "font-size": 11 });
    var tx = lx + lw * state.thr;
    s("line", { x1: tx, x2: tx, y1: ly - 3, y2: ly + 13, style: "stroke:var(--ink);stroke-width:1.5" }, g);

    // Hover: one listener for the whole grid.
    var hl = s("rect", { width: cell, height: cell, style: "fill:none;stroke:var(--ink);stroke-width:1.5", visibility: "hidden" }, g);
    var hl2 = s("rect", { width: cell, height: cell, style: "fill:none;stroke:var(--ink);stroke-width:1;opacity:0.5", visibility: "hidden" }, g);
    var hit = s("rect", { x: 0, y: 0, width: plot, height: plot, fill: "transparent" }, g);
    hit.addEventListener("mousemove", function (ev) {
      var r = hit.getBoundingClientRect();
      var c = Math.floor((ev.clientX - r.left) / r.width * L), rr = Math.floor((ev.clientY - r.top) / r.height * L);
      if (c < 0 || rr < 0 || c >= L || rr >= L) return;
      hl.setAttribute("x", c * cell); hl.setAttribute("y", rr * cell); hl.setAttribute("visibility", "visible");
      hl2.setAttribute("x", rr * cell); hl2.setAttribute("y", c * cell); hl2.setAttribute("visibility", rr === c ? "hidden" : "visible");
      var dist = Math.abs(c - rr);
      var kind = dist === 0 ? "same layer" : dist === 1 ? "adjacent pair" : "non-adjacent pair, " + dist + " layers apart";
      showTip("<b>Layers " + Math.min(c, rr) + " and " + Math.max(c, rr) + "</b><br>CKA " + S[rr][c].toFixed(3) + "<br>" + kind, ev);
    });
    hit.addEventListener("mouseleave", function () { hideTip(); hl.setAttribute("visibility", "hidden"); hl2.setAttribute("visibility", "hidden"); });

    var n = counts(S, state.thr);
    var t = state.thr.toFixed(2);
    var ratioText = n.adj === 0 ? "" : ", " + (n.na / n.adj).toFixed(1) + " non-adjacent pairs for every adjacent one";
    document.getElementById("readout").textContent =
      "At CKA ≥ " + t + ", " + state.model + " has " + n.adj + " adjacent and " + n.na + " non-adjacent high-similarity pairs" + ratioText + ".";
  }

  function initExplorer() {
    var thr = document.getElementById("thr"), out = document.getElementById("thr-out"), fade = document.getElementById("fade");
    if (!thr) return;
    thr.addEventListener("input", function () {
      state.thr = parseFloat(thr.value);
      out.textContent = state.thr.toFixed(2);
      drawHeatmap();
    });
    fade.addEventListener("change", function () { state.fade = fade.checked; drawHeatmap(); });
    drawRatio();
    drawHeatmap();
    fetch("/assets/fcm/cka.json").then(function (r) { return r.json(); }).then(function (d) {
      CKA = d; drawHeatmap();
    }).catch(function () {
      document.getElementById("heatmap").textContent = "The similarity matrices could not be loaded.";
    });
  }

  // ---------------------------------------------------------------- head-to-head dot plot

  function drawH2H() {
    var box = document.getElementById("h2h");
    if (!box) return;
    box.textContent = "";
    var W = box.clientWidth || 880;
    var narrow = W < 560;
    var nameW = narrow ? 104 : 128, dW = narrow ? 64 : 92, offW = narrow ? 40 : 58;
    var rowH = 30, mt = 44, sepGap = 14;
    var H = mt + H2H.length * rowH + sepGap + 8;
    var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "WikiText-2 perplexity of five methods on thirteen models at 2x compression. A table version follows." }, box);
    var x0 = nameW, x1 = W - dW - offW;
    var x = logScale(20, 125, x0, x1);
    var ticks = narrow ? [20, 30, 50, 80] : [20, 30, 40, 50, 60, 80, 100];
    ticks.forEach(function (t) {
      s("line", { class: "grid-line", x1: x(t), x2: x(t), y1: mt - 6, y2: H - 4 }, svg);
      txt(svg, x(t), mt - 12, String(t), { "font-size": 11, "text-anchor": "middle" });
    });
    txt(svg, x0, 13, "Perplexity, log scale (lower is better)", { "font-size": 11.5, style: "fill:var(--ink-3)" });
    txt(svg, W - 2, 13, narrow ? "vs best" : "vs best baseline", { "font-size": 11.5, "text-anchor": "end", style: "fill:var(--ink-3)" });

    H2H.forEach(function (d, i) {
      var y = mt + i * rowH + rowH / 2 + (d.sep ? sepGap : 0);
      if (d.sep) s("line", { class: "axis-line", x1: 0, x2: W, y1: y - rowH / 2 - sepGap / 2, y2: y - rowH / 2 - sepGap / 2 }, svg);
      var g = s("g", {}, svg);
      txt(g, 0, y + 4, d.m, { "font-size": 12.5, style: "fill:var(--ink)" });
      var vals = METHODS.map(function (mm) { return d[mm.key][0]; });
      var inV = vals.filter(function (v) { return v <= 125; });
      s("line", { x1: x(Math.min.apply(null, inV)), x2: x(Math.max.apply(null, inV)), y1: y, y2: y, style: "stroke:var(--rule);stroke-width:2" }, g);
      // Draw baselines first, FCM last so it sits on top.
      METHODS.slice().reverse().forEach(function (mm) {
        var v = d[mm.key][0];
        if (v > 125) {
          var ox = x1 + 10, oy = y + (mm.key === "flat" ? -6 : 6);
          marker(g, mm.shape, ox, oy, 3.8, mm.color, true);
          if (!narrow) txt(g, ox + 8, oy + 4, fmt(v), { "font-size": 10.5, style: "fill:var(--ink-3)" });
        } else {
          marker(g, mm.shape, x(v), y, mm.key === "fcm" ? 5.5 : 4.5, mm.color, true);
        }
      });
      txt(g, W - 2, y + 4, signed(d.d) + (d.tie ? " (tie)" : ""), { "font-size": 12, "text-anchor": "end",
        style: "fill:" + (d.d.charAt(0) === "+" ? "var(--ink)" : "var(--ink-2)") });
      var hit = s("rect", { x: 0, y: y - rowH / 2, width: W, height: rowH, fill: "transparent" }, g);
      hit.addEventListener("mousemove", function (ev) {
        var rows = METHODS.slice().sort(function (a, b) { return d[a.key][0] - d[b.key][0]; }).map(function (mm) {
          return '<div class="row"><span>' + swatch(mm.color, mm.shape) + esc(mm.name) + "</span><span>" + fmt(d[mm.key][0]) + " ± " + fmt(d[mm.key][1]) + "</span></div>";
        }).join("");
        showTip("<b>" + esc(d.m) + "</b>" + rows + (d.note ? '<div style="margin-top:4px;color:var(--ink-2)">' + esc(d.note) + "</div>" : ""), ev);
      });
      hit.addEventListener("mouseleave", hideTip);
    });
    // Off-scale column label.
    txt(svg, x1 + 10, mt - 12, ">125", { "font-size": 11, "text-anchor": "middle" });
  }

  function h2hTable() {
    var box = document.getElementById("h2h-table");
    if (!box) return;
    var wrap = h("div", { class: "table-wrap" }, box);
    var t = h("table", { class: "data" }, wrap);
    var tr = h("tr", {}, h("thead", {}, t));
    ["Model", "ShortGPT", "FlattenGPT", "SWM", "DeltaLLM", "FCM", "vs best"].forEach(function (c) { h("th", { scope: "col" }, tr, c); });
    var tb = h("tbody", {}, t);
    H2H.forEach(function (d) {
      var r = h("tr", {}, tb);
      h("th", { scope: "row" }, r, d.m);
      var best = Math.min(d.short[0], d.flat[0], d.swm[0], d.delta[0], d.fcm[0]);
      ["short", "flat", "swm", "delta", "fcm"].forEach(function (k) {
        h("td", d[k][0] === best ? { class: "best" } : {}, r, fmt(d[k][0]) + " ± " + fmt(d[k][1]));
      });
      h("td", {}, r, signed(d.d) + (d.tie ? " (tie)" : ""));
    });
  }

  // ---------------------------------------------------------------- compression sweep

  function drawSweep() {
    var box = document.getElementById("sweep");
    if (!box) return;
    box.textContent = "";
    SWEEP.forEach(function (d) {
      var panel = h("div", {}, box);
      h("p", { class: "panel-title" }, panel, d.m);
      var W = panel.clientWidth || 280, H = 230;
      var ml = 36, mr = 12, mt = 8, mb = 30;
      var svg = s("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img",
        "aria-label": "Perplexity against compression ratio for " + d.m + ". A table version follows." }, panel);
      var x = linScale(1.5, 3.0, ml, W - mr), y = logScale(8, 450, H - mb, mt);
      [10, 20, 50, 100, 200, 400].forEach(function (t) {
        s("line", { class: "grid-line", x1: ml, x2: W - mr, y1: y(t), y2: y(t) }, svg);
        txt(svg, ml - 6, y(t) + 4, String(t), { "font-size": 11, "text-anchor": "end" });
      });
      s("line", { class: "axis-line", x1: ml, x2: W - mr, y1: H - mb, y2: H - mb }, svg);
      SWEEP_X.forEach(function (v) { txt(svg, x(v), H - mb + 16, v.toFixed(1) + "×", { "font-size": 11, "text-anchor": "middle" }); });
      SWEEP_METHODS.slice().reverse().forEach(function (mm) {
        var pts = d[mm.key].map(function (p, i) { return x(SWEEP_X[i]) + "," + y(p[0]); });
        s("polyline", { points: pts.join(" "), style: "fill:none;stroke:" + mm.color + ";stroke-width:2;stroke-linejoin:round" }, svg);
        d[mm.key].forEach(function (p, i) { marker(svg, mm.shape, x(SWEEP_X[i]), y(p[0]), 4, mm.color, true); });
      });
      // Crosshair at the nearest ratio.
      var cross = s("line", { y1: mt, y2: H - mb, style: "stroke:var(--ink-3);stroke-width:1", visibility: "hidden" }, svg);
      var hit = s("rect", { x: ml, y: mt, width: W - ml - mr, height: H - mt - mb, fill: "transparent" }, svg);
      hit.addEventListener("mousemove", function (ev) {
        var r = svg.getBoundingClientRect();
        var px = (ev.clientX - r.left) * (W / r.width);
        var i = 0, best = Infinity;
        SWEEP_X.forEach(function (v, k) { var dd = Math.abs(x(v) - px); if (dd < best) { best = dd; i = k; } });
        cross.setAttribute("x1", x(SWEEP_X[i])); cross.setAttribute("x2", x(SWEEP_X[i])); cross.setAttribute("visibility", "visible");
        var rows = SWEEP_METHODS.slice().sort(function (a, b) { return d[a.key][i][0] - d[b.key][i][0]; }).map(function (mm) {
          return '<div class="row"><span>' + swatch(mm.color, mm.shape) + esc(mm.name) + "</span><span>" + fmt(d[mm.key][i][0]) + " ± " + fmt(d[mm.key][i][1]) + "</span></div>";
        }).join("");
        showTip("<b>" + esc(d.m) + " at " + SWEEP_X[i].toFixed(1) + "×</b>" + rows, ev);
      });
      hit.addEventListener("mouseleave", function () { hideTip(); cross.setAttribute("visibility", "hidden"); });
    });
  }

  function sweepTable() {
    var box = document.getElementById("sweep-table");
    if (!box) return;
    var wrap = h("div", { class: "table-wrap" }, box);
    var t = h("table", { class: "data" }, wrap);
    var tr = h("tr", {}, h("thead", {}, t));
    ["Model", "Ratio", "ShortGPT", "FlattenGPT", "DeltaLLM", "FCM"].forEach(function (c) { h("th", { scope: "col" }, tr, c); });
    var tb = h("tbody", {}, t);
    SWEEP.forEach(function (d) {
      SWEEP_X.forEach(function (v, i) {
        var r = h("tr", {}, tb);
        h("th", { scope: "row" }, r, i === 0 ? d.m : "");
        h("td", {}, r, v.toFixed(1) + "×");
        var best = Math.min(d.short[i][0], d.flat[i][0], d.delta[i][0], d.fcm[i][0]);
        ["short", "flat", "delta", "fcm"].forEach(function (k) {
          h("td", d[k][i][0] === best ? { class: "best" } : {}, r, fmt(d[k][i][0]) + " ± " + fmt(d[k][i][1]));
        });
      });
    });
  }

  // ---------------------------------------------------------------- page chrome

  function initTheme() {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    function label() { btn.textContent = isDark() ? "Light theme" : "Dark theme"; }
    label();
    btn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      label();
      redraw();
    });
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function () { label(); redraw(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }

  function initCopy() {
    document.querySelectorAll("button.copy").forEach(function (b) {
      b.addEventListener("click", function () {
        var text = document.getElementById(b.getAttribute("data-copy")).textContent;
        var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else { fallbackCopy(text); done(); }
      });
    });
  }
  function fallbackCopy(text) {
    var ta = h("textarea", { style: "position:fixed;opacity:0" }, document.body);
    ta.value = text; ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  function redraw() {
    if (document.getElementById("ratio-chart")) { drawRatio(); drawHeatmap(); }
    drawH2H();
    drawSweep();
  }

  function init() {
    initTheme();
    initCopy();
    initExplorer();
    legendInto(document.getElementById("h2h-legend"), METHODS);
    legendInto(document.getElementById("sweep-legend"), SWEEP_METHODS);
    drawH2H();
    drawSweep();
    h2hTable();
    sweepTable();
    var lastW = document.documentElement.clientWidth, timer = null;
    window.addEventListener("resize", function () {
      if (document.documentElement.clientWidth === lastW) return;
      lastW = document.documentElement.clientWidth;
      clearTimeout(timer);
      timer = setTimeout(redraw, 120);
    });
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
