// Squeezy add-on: Block Flow (ported from BlockFlow.jsx v1.4 by Kholy)
// runs as function(params, comp, layers)
var SCRIPT_NAME = "BlockFlow";
var VERSION = "1.4";

// ------------------------------------------------------------------
// helpers (ES3 safe)
// ------------------------------------------------------------------
function rr(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function makeRng(seed) {
    var s = Math.abs(Math.floor(seed)) % 4294967296;
    if (s === 0) { s = 2463534242; }
    var r = function () {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
    for (var i = 0; i < 8; i++) { r(); }
    return r;
}

// sort keys by time (stable), collapse duplicates keeping the last one written
function normKeys(keys) {
    var arr = [];
    for (var i = 0; i < keys.length; i++) { arr.push({ t: keys[i][0], v: keys[i][1], i: i }); }
    arr.sort(function (a, b) {
        if (Math.abs(a.t - b.t) < 1e-6) { return a.i - b.i; }
        return a.t - b.t;
    });
    var out = [];
    for (var j = 0; j < arr.length; j++) {
        if (out.length && Math.abs(out[out.length - 1][0] - arr[j].t) < 1e-6) {
            out[out.length - 1][1] = arr[j].v;
        } else {
            out.push([arr[j].t, arr[j].v]);
        }
    }
    return out;
}

// ------------------------------------------------------------------
// PLANNER  — pure maths, no AE calls. Decides every block and keyframe.
// ------------------------------------------------------------------
// Step-zoom profile measured from the reference: fraction of the interval
// after a change  →  share of that change's total (log) shrink.
var ZOOM_PROFILE = [[0, 0.72], [0.19, 0.216], [0.33, 0.032], [0.81, 0.032]];

// o.sizes = [[w,h], ...] one per card (already in comp pixels)
function buildPlan(n, o) {
    var rnd = makeRng(o.seed);
    var fps = o.fps, F = 1 / fps;
    function q(t) { return Math.round(t * fps) / fps; }

    var S = Math.max(1, Math.min(Math.round(o.slots), n));
    var pad = Math.max(0, Math.round(o.pad));
    var i, s, k;

    // ---- one block size for every card: "Grid columns" across an average card
    var sumW = 0;
    for (i = 0; i < n; i++) { sumW += o.sizes[i][0]; }
    var avgW = sumW / n;
    var cellPx = avgW / Math.max(1, Math.round(o.cols));

    // per-card grid geometry (each card keeps its own width × height)
    function geom(w, h) {
        var g = {};
        g.w = w; g.h = h;
        g.cols = Math.max(1, Math.round(w / cellPx));
        g.rows = Math.max(1, Math.round(h / cellPx));
        g.cellW = w / g.cols; g.cellH = h / g.rows;
        g.padX = rr(pad * g.cellW); g.padY = rr(pad * g.cellH);
        g.padW = w + 2 * g.padX; g.padH = h + 2 * g.padY;
        g.gCols = g.cols + 2 * pad; g.gRows = g.rows + 2 * pad;
        g.xE = function (x) { return g.padX + rr((x - pad) * g.cellW); };
        g.yE = function (y) { return g.padY + rr((y - pad) * g.cellH); };
        g.rect = function (gx, gy, gw, gh) {
            var x0 = g.xE(gx), y0 = g.yE(gy);
            return [x0, y0, g.xE(gx + gw) - x0, g.yE(gy + gh) - y0];
        };
        return g;
    }

    var D = Math.max(2 * F, q(o.trans));
    var I = Math.max(F, q(o.interval));
    var cycle = S * I;

    // ---- cards (one per image) & timing
    var cards = [];
    for (i = 0; i < n; i++) {
        cards.push({ index: i, slot: i % S, tIn: q(i * I), tOut: null,
                     start: 0, end: 0, cin: [], cout: [], g: geom(o.sizes[i][0], o.sizes[i][1]),
                     crisp: [], mosaic: [], accent: [], nx: 0, ny: 0,
                     scaleKeys: [], posKeys: [] });
    }
    for (i = 0; i < n; i++) {
        if (i + S < n) { cards[i].tOut = cards[i + S].tIn; }
        else if (o.exitAtEnd) { cards[i].tOut = q(cards[i].tIn + cycle + (o.holdEnd || 0)); }
    }
    var lastT = 0;
    for (i = 0; i < n; i++) {
        var e = (cards[i].tOut !== null) ? cards[i].tOut + D : cards[i].tIn + cycle + (o.holdEnd || 0);
        if (e > lastT) { lastT = e; }
    }
    var duration = q(lastT + (o.exitAtEnd ? 0.4 : 0));
    for (i = 0; i < n; i++) {
        cards[i].start = cards[i].tIn;
        cards[i].end = (cards[i].tOut !== null) ? Math.min(duration, q(cards[i].tOut + D + F)) : duration;
    }

    // ---- slot columns: spaced by the average width of the cards in each slot
    var cx = o.compW / 2, cy = o.compH / 2;
    var slotAvg = [];
    for (s = 0; s < S; s++) {
        var sw = 0, sc = 0;
        for (i = s; i < n; i += S) { sw += o.sizes[i][0]; sc++; }
        slotAvg.push(sw / sc);
    }
    var slotCX = [0];
    for (s = 1; s < S; s++) {
        // neighbours overlap by o.overlap of the narrower slot
        var ov = Math.min(slotAvg[s - 1], slotAvg[s]) * o.overlap;
        slotCX.push(slotCX[s - 1] + slotAvg[s - 1] / 2 + slotAvg[s] / 2 - ov);
    }
    var left = slotCX[0] - slotAvg[0] / 2, right = slotCX[S - 1] + slotAvg[S - 1] / 2;
    var shiftX = cx - (left + right) / 2;
    for (s = 0; s < S; s++) { slotCX[s] += shiftX; }

    // ---- global step zoom Z(t)
    var zsteps = [];
    if (o.zoomAmt > 0) {
        var total = Math.log(Math.max(0.05, 1 - o.zoomAmt));
        for (k = 1; k * I <= duration + 1e-6; k++) {
            for (var zp = 0; zp < ZOOM_PROFILE.length; zp++) {
                var zt = q(k * I + ZOOM_PROFILE[zp][0] * I);
                if (zt <= duration) { zsteps.push([zt, Math.exp(total * ZOOM_PROFILE[zp][1])]); }
            }
        }
    }
    function Z(t) {
        var z = 1;
        for (var a = 0; a < zsteps.length; a++) { if (zsteps[a][0] <= t + 1e-6) { z *= zsteps[a][1]; } }
        return z;
    }

    function sweepVal(dir, g, c, r) {
        var u = (c + 0.5) / g.cols, v = (r + 0.5) / g.rows;
        if (dir === 1) { return u; }
        if (dir === 2) { return 1 - u; }
        if (dir === 3) { return v; }
        return 1 - v;
    }

    function mosaicFlashes(card, T) {
        var g = card.g;
        var count = Math.round(o.mosaicAmt * g.cols * g.rows * 0.5);
        for (var m = 0; m < count; m++) {
            var gw = (rnd() < 0.7 || g.cols < 2) ? 1 : 2;
            var gh = (rnd() < 0.7 || g.rows < 2) ? 1 : 2;
            var gx, gy;
            if (rnd() < 0.85 || pad === 0) {
                gx = pad + Math.floor(rnd() * (g.cols - gw + 1));
                gy = pad + Math.floor(rnd() * (g.rows - gh + 1));
            } else {
                gx = clamp(pad - 1 + Math.floor(rnd() * (g.cols + 3 - gw)), 0, g.gCols - gw);
                gy = clamp(pad - 1 + Math.floor(rnd() * (g.rows + 3 - gh)), 0, g.gRows - gh);
            }
            var st = q(T + D * rnd() * 0.8);
            var en = q(st + (2 + Math.floor(rnd() * 4)) * F);
            card.mosaic.push({ r: g.rect(gx, gy, gw, gh), keys: [[card.start, 0], [st, 100], [en, 0]] });
        }
    }

    function accentFlashes(card, T) {
        var g = card.g;
        var count = Math.round(o.accentAmt * g.cols * g.rows * 0.35);
        for (var m = 0; m < count; m++) {
            var gw = Math.min(g.gCols, 1 + Math.floor(rnd() * 3));
            var gh = Math.min(g.gRows, 1 + Math.floor(rnd() * 3));
            var gx, gy;
            if (rnd() < 0.75) {
                gx = clamp(pad - 1 + Math.floor(rnd() * (g.cols + 3 - gw)), 0, g.gCols - gw);
                gy = clamp(pad - 1 + Math.floor(rnd() * (g.rows + 3 - gh)), 0, g.gRows - gh);
            } else {
                gx = Math.floor(rnd() * (g.gCols - gw + 1));
                gy = Math.floor(rnd() * (g.gRows - gh + 1));
            }
            var st = q(T + D * rnd() * 0.9);
            var en = q(st + (2 + Math.floor(rnd() * 6)) * F);
            card.accent.push({ r: g.rect(gx, gy, gw, gh), keys: [[card.start, 0], [st, 100], [en, 0]] });
        }
    }

    // ---- transition events per slot
    for (s = 0; s < S; s++) {
        var list = [];
        for (i = s; i < n; i += S) { list.push(i); }
        var events = [];
        for (k = 0; k < list.length; k++) {
            events.push({ T: cards[list[k]].tIn, inI: list[k], outI: (k > 0 ? list[k - 1] : -1) });
        }
        var lastC = list[list.length - 1];
        if (o.exitAtEnd && cards[lastC].tOut !== null) {
            events.push({ T: cards[lastC].tOut, inI: -1, outI: lastC });
        }

        for (var ev = 0; ev < events.length; ev++) {
            var E = events[ev], T = E.T;
            var dir = Math.floor(rnd() * 5); // 0 = pure random, 1-4 = soft sweep
            var pass = [];
            if (E.inI >= 0) { pass.push([cards[E.inI], true]); }
            if (E.outI >= 0) { pass.push([cards[E.outI], false]); }
            for (var ps = 0; ps < pass.length; ps++) {
                var cd0 = pass[ps][0], incoming = pass[ps][1], g0 = cd0.g;
                for (var r = 0; r < g0.rows; r++) {
                    for (var c = 0; c < g0.cols; c++) {
                        var sv = (dir === 0) ? rnd() : sweepVal(dir, g0, c, r);
                        var u = 0.55 * rnd() + 0.45 * sv;
                        if (incoming) { cd0.cin[r * g0.cols + c] = Math.max(q(T + D * (0.12 + 0.8 * u)), q(T + F)); }
                        else { cd0.cout[r * g0.cols + c] = q(T + D * 0.8 * u); }
                    }
                }
            }
            if (E.inI >= 0) { mosaicFlashes(cards[E.inI], T); accentFlashes(cards[E.inI], T); }
            if (E.outI >= 0) { mosaicFlashes(cards[E.outI], T); }
            if (E.inI < 0 && E.outI >= 0) { accentFlashes(cards[E.outI], T); }
        }
    }

    // ---- crisp cell masks + motion (scale/position) per card
    for (i = 0; i < n; i++) {
        var cd = cards[i], g = cd.g;
        for (var r2 = 0; r2 < g.rows; r2++) {
            for (var c2 = 0; c2 < g.cols; c2++) {
                var id = r2 * g.cols + c2;
                var a = cd.cin[id];
                var keys = [[cd.start, 0], [a, 100]];
                if (cd.cout[id] !== undefined) { keys.push([Math.max(cd.cout[id], q(a + F)), 0]); }
                cd.crisp.push({ r: g.rect(pad + c2, pad + r2, 1, 1), keys: keys });
            }
        }
        cd.cin = null; cd.cout = null;

        cd.nx = slotCX[cd.slot] + (o.jitter > 0 ? rr((rnd() * 2 - 1) * o.jitter) : 0);
        cd.ny = cy + (o.jitter > 0 ? rr((rnd() * 2 - 1) * o.jitter) : 0);

        var z0 = Z(cd.start);
        var times = [cd.start];
        for (k = 0; k < zsteps.length; k++) {
            if (zsteps[k][0] > cd.start + 1e-6 && zsteps[k][0] < cd.end - 1e-6) { times.push(zsteps[k][0]); }
        }
        for (k = 0; k < times.length; k++) {
            var rel = Z(times[k]) / z0;
            cd.scaleKeys.push([times[k], [100 * rel, 100 * rel]]);
            cd.posKeys.push([times[k], [cx + rel * (cd.nx - cx), cy + rel * (cd.ny - cy)]]);
        }

        // flatten geometry for the builder
        cd.w = g.w; cd.h = g.h; cd.padW = g.padW; cd.padH = g.padH; cd.padX = g.padX; cd.padY = g.padY;
        cd.mosaicH = g.gCols * o.mosaicDetail; cd.mosaicV = g.gRows * o.mosaicDetail;
        cd.cols = g.cols; cd.rows = g.rows;
        cd.g = null;
    }

    // ---- stacking order (bottom → top)
    var order = [];
    for (i = 0; i < n; i++) { order.push(i); }
    if (o.rightOnTop) {
        order.sort(function (x, y) {
            if (cards[x].slot !== cards[y].slot) { return cards[x].slot - cards[y].slot; }
            return x - y;
        });
    }

    return { duration: duration, fps: fps, S: S, cellPx: cellPx, cards: cards, order: order, zsteps: zsteps };
}

// ------------------------------------------------------------------
// AE BUILDER
// ------------------------------------------------------------------
function hexToRgb(h) {
    h = String(h).replace(/[^0-9a-fA-F]/g, "");
    if (h.length === 3) { h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2); }
    if (h.length !== 6) { return [0, 0.82, 0.7]; }
    return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255];
}

function rectShape(r) {
    var sh = new Shape();
    sh.vertices = [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]], [r[0], r[1] + r[3]]];
    sh.closed = true;
    return sh;
}

function setHold(prop, keys) {
    keys = normKeys(keys);
    if (!keys.length) { return; }
    if (keys.length === 1) { prop.setValue(keys[0][1]); return; }
    var ts = [], vs = [];
    for (var i = 0; i < keys.length; i++) { ts.push(keys[i][0]); vs.push(keys[i][1]); }
    prop.setValuesAtTimes(ts, vs);
    for (var k = 1; k <= prop.numKeys; k++) {
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    }
}

function addRectMasks(layer, list) {
    var parade = layer.property("ADBE Mask Parade");
    for (var i = 0; i < list.length; i++) {
        var m = parade.addProperty("ADBE Mask Atom");
        m.maskMode = MaskMode.ADD;
        m.property("ADBE Mask Shape").setValue(rectShape(list[i].r));
        setHold(m.property("ADBE Mask Opacity"), list[i].keys);
    }
}

function natCmp(a, b) {
    var ax = String(a).toLowerCase().match(/(\d+|\D+)/g) || [];
    var bx = String(b).toLowerCase().match(/(\d+|\D+)/g) || [];
    while (ax.length && bx.length) {
        var x = ax.shift(), y = bx.shift();
        var nx = /^\d/.test(x), ny = /^\d/.test(y);
        if (nx && ny) { var d = parseInt(x, 10) - parseInt(y, 10); if (d) { return d; } }
        else if (x !== y) { return x < y ? -1 : 1; }
    }
    return ax.length - bx.length;
}

function isCompItem(it) {
    try { if (it instanceof CompItem) { return true; } } catch (e) {}
    try { return it && typeof it.numLayers === "number" && typeof it.layers === "object"; } catch (e2) { return false; }
}
function isUsableSource(it) {
    if (!it) { return false; }
    if (isCompItem(it)) { return true; }
    var ms = null;
    try { ms = it.mainSource; } catch (e) { ms = null; }
    if (!ms) { return false; }
    try { if (ms.color !== undefined && ms.file === undefined) { return false; } } catch (e2) {}   // solid
    return it.width > 0 && it.height > 0;
}

// images/comps selected in the Project panel (sorted by name)
function getProjectItems() {
    var out = [];
    var sel = app.project.selection;
    for (var i = 0; i < sel.length; i++) { if (isUsableSource(sel[i])) { out.push(sel[i]); } }
    out.sort(function (a, b) { return natCmp(a.name, b.name); });
    return out;
}

// selected layers in a comp → their sources. Layers without a usable source
// (text, shape, solid…) are precomposed first. Returns items + the layers to hide
// + the top-most layer (new cards are stacked right above it).
// layer filter without instanceof (more reliable when run from the Squeezy panel)
function cardSkipReason(L) {
    try { if (L.property("ADBE Camera Options Group")) { return "camera"; } } catch (e1) {}
    try { if (L.property("ADBE Light Options Group")) { return "light"; } } catch (e2) {}
    try { if (L.nullLayer) { return "null"; } } catch (e3) {}
    try { if (L.adjustmentLayer) { return "adjustment layer"; } } catch (e4) {}
    try { if (!L.property("ADBE Transform Group")) { return "no transform"; } } catch (e5) { return "unreadable"; }
    return "";
}

function resolveLayers(comp, reverse, given) {
    var sel = (given && given.length) ? given : comp.selectedLayers, arr = [], i, skipped = [];
    for (i = 0; i < sel.length; i++) { arr.push(sel[i]); }
    arr.sort(function (a, b) { return a.index - b.index; });
    if (reverse) { arr.reverse(); }
    var items = [], layers = [];
    for (i = 0; i < arr.length; i++) {
        var L = arr[i];
        var why = cardSkipReason(L);
        if (why) { skipped.push(L.name + " (" + why + ")"); continue; }
        if (!(L.source && isUsableSource(L.source))) {
            var idx = L.index, nm = L.name;
            comp.layers.precompose([idx], "BF src – " + nm, true);
            L = comp.layer(idx);
            cropToContent(L, comp.time);
        }
        items.push(L.source);
        layers.push(L);
    }
    if (!layers.length) { throw new Error("None of the selected layers can be used: " + (skipped.length ? skipped.join(", ") : "nothing selected")); }
    var top = layers[0];
    for (i = 1; i < layers.length; i++) { if (layers[i].index < top.index) { top = layers[i]; } }
    return { items: items, layers: layers, top: top };
}

// A shape/text layer just precomposed sits in a comp-sized precomp. Shrink that
// precomp to the shape's own bounds so the card hugs the shape, and keep the
// outer layer exactly where it was on screen.
function cropToContent(outer, time) {
    try {
        var tt = time - outer.startTime, nc = outer.source, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, j;
        var inner = [];
        for (j = 1; j <= nc.numLayers; j++) { inner.push(nc.layer(j)); }
        for (j = 0; j < inner.length; j++) {
            var Ly = inner[j];
            if (!Ly.enabled || cardSkipReason(Ly)) { continue; }
            var r = Ly.sourceRectAtTime(tt, false);
            var tg = Ly.property("ADBE Transform Group");
            var ap = tg.property("ADBE Anchor Point").valueAtTime(tt, false);
            var ps = tg.property("ADBE Position").valueAtTime(tt, false);
            var sc = tg.property("ADBE Scale").valueAtTime(tt, false);
            var rot = 0;
            try { rot = tg.property("ADBE Rotate Z").valueAtTime(tt, false); } catch (eR) {}
            var cs = Math.cos(rot * Math.PI / 180), sn = Math.sin(rot * Math.PI / 180);
            var corners = [[r.left, r.top], [r.left + r.width, r.top], [r.left, r.top + r.height], [r.left + r.width, r.top + r.height]];
            for (var k = 0; k < 4; k++) {
                var vx = (corners[k][0] - ap[0]) * sc[0] / 100, vy = (corners[k][1] - ap[1]) * sc[1] / 100;
                var x = ps[0] + vx * cs - vy * sn, y = ps[1] + vx * sn + vy * cs;
                if (x < minX) { minX = x; } if (x > maxX) { maxX = x; }
                if (y < minY) { minY = y; } if (y > maxY) { maxY = y; }
            }
        }
        if (maxX <= minX || maxY <= minY) { return; }
        var m = 4; // small margin for anti-aliasing / strokes
        minX = Math.floor(minX - m); minY = Math.floor(minY - m);
        var w = Math.ceil(maxX + m) - minX, h = Math.ceil(maxY + m) - minY;
        w = clamp(w, 4, 30000); h = clamp(h, 4, 30000);
        nc.width = w; nc.height = h;
        for (j = 0; j < inner.length; j++) {
            var pp = inner[j].property("ADBE Transform Group").property("ADBE Position");
            if (pp.numKeys > 0) {
                for (var kk = 1; kk <= pp.numKeys; kk++) {
                    var kv = pp.keyValue(kk);
                    pp.setValueAtKey(kk, kv.length > 2 ? [kv[0] - minX, kv[1] - minY, kv[2]] : [kv[0] - minX, kv[1] - minY]);
                }
            } else if (!pp.expressionEnabled) {
                var pv = pp.value;
                pp.setValue(pv.length > 2 ? [pv[0] - minX, pv[1] - minY, pv[2]] : [pv[0] - minX, pv[1] - minY]);
            }
        }
        var otg = outer.property("ADBE Transform Group");
        otg.property("ADBE Anchor Point").setValue([w / 2, h / 2]);
        otg.property("ADBE Position").setValue([minX + w / 2, minY + h / 2]);
    } catch (e) { /* keep the full-comp precomp if anything fails */ }
}

// size of every card in comp pixels
//   fixed size  → the typed W × H
//   layers mode → source size × the layer's current scale (what you see in the comp)
//   project mode → source size
// then × Card scale %
function cardSizes(items, layers, o, time) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
        var w, h;
        if (o.fixedSize) { w = o.fixedW; h = o.fixedH; }
        else {
            w = items[i].width * items[i].pixelAspect / o.pa;
            h = items[i].height;
            if (layers && layers[i]) {
                var sv = [100, 100];
                try { sv = layers[i].property("ADBE Transform Group").property("ADBE Scale").valueAtTime(time, false); } catch (e) {}
                w *= Math.abs(sv[0]) / 100;
                h *= Math.abs(sv[1]) / 100;
            }
        }
        out.push([Math.max(8, Math.round(w * o.cardScale)), Math.max(8, Math.round(h * o.cardScale))]);
    }
    return out;
}

function itemHasAlpha(it) {
    if (isCompItem(it)) { return true; }
    try { return !!it.mainSource.hasAlpha; } catch (e) { return false; }
}

function setEffectParam(fx, index, englishName, value) {
    var p = null;
    try { p = fx.property(englishName); } catch (e1) { p = null; }
    if (!p) { try { p = fx.property(index); } catch (e2) { p = null; } }
    if (p) { try { p.setValue(value); } catch (e3) {} }
}

function build(items, o, progress) {
    var n = items.length;
    var plan = buildPlan(n, o);
    var pa = o.pa, fps = o.fps, dur = plan.duration;
    var accent = hexToRgb(o.accentHex);

    var stamp = 1;
    for (var p = 1; p <= app.project.numItems; p++) {
        var mm = app.project.item(p).name.match(/^BlockFlow (\d+)$/);
        if (mm && (function (x) { try { return x instanceof FolderItem || typeof x.numItems === "number"; } catch (e) { return false; } })(app.project.item(p))) { stamp = Math.max(stamp, parseInt(mm[1], 10) + 1); }
    }
    var folder = app.project.items.addFolder("BlockFlow " + stamp);
    var pre = app.project.items.addFolder("BF precomps " + stamp);
    pre.parentFolder = folder;

    var totalSteps = n * 2 + 1, step = 0;
    function tick(msg) { step++; if (progress) { progress(step / totalSteps, msg); } }

    // ---- per-card comps: clean image, mosaic version, and the masked card
    var cardComps = [], i;
    for (i = 0; i < n; i++) {
        var it = items[i], cd = plan.cards[i];

        // clean image: cover-fit to the card, edges extended for spill blocks
        var ic = app.project.items.addComp("BF img " + (i + 1) + " – " + it.name, cd.padW, cd.padH, pa, dur, fps);
        ic.parentFolder = pre;
        var alpha = itemHasAlpha(it);
        var L = ic.layers.add(it);
        var ew = it.width * it.pixelAspect / pa, eh = it.height;
        if (o.fixedSize) {
            // fixed card size: cover-fit (crop, never stretch)
            var sc = Math.max(cd.w / ew, cd.h / eh) * 100;
            L.property("ADBE Transform Group").property("ADBE Scale").setValue([sc, sc]);
        } else {
            // card = the layer's own size: exact fit (keeps non-uniform layer scale too)
            L.property("ADBE Transform Group").property("ADBE Scale").setValue([cd.w / ew * 100, cd.h / eh * 100]);
        }
        L.property("ADBE Transform Group").property("ADBE Position").setValue([cd.padW / 2, cd.padH / 2]);
        if (!alpha) {
            try {
                var mt = L.property("ADBE Effect Parade").addProperty("ADBE Tile");
                setEffectParam(mt, 4, "Output Width", 400);
                setEffectParam(mt, 5, "Output Height", 400);
                setEffectParam(mt, 6, "Mirror Edges", 1);
            } catch (eTile) {}
        }

        // mosaic version
        var mc = app.project.items.addComp("BF mosaic " + (i + 1), cd.padW, cd.padH, pa, dur, fps);
        mc.parentFolder = pre;
        var ML = mc.layers.add(ic);
        var mo = ML.property("ADBE Effect Parade").addProperty("ADBE Mosaic");
        setEffectParam(mo, 1, "Horizontal Blocks", cd.mosaicH);
        setEffectParam(mo, 2, "Vertical Blocks", cd.mosaicV);
        tick("Image " + (i + 1));

        // card comp: crisp cells (bottom), mosaic flashes, accent blocks (top)
        var cc = app.project.items.addComp("BF card " + (i + 1), cd.padW, cd.padH, pa, dur, fps);
        cc.parentFolder = pre;
        var lay = cc.layers.add(ic);
        lay.startTime = cd.start;
        lay.name = "image";
        addRectMasks(lay, cd.crisp);
        if (cd.mosaic.length) {
            lay = cc.layers.add(mc);
            lay.startTime = cd.start;
            lay.name = "pixel blocks";
            addRectMasks(lay, cd.mosaic);
        }
        if (cd.accent.length) {
            var ac = cc.layers.addSolid(accent, "Accent blocks", cd.padW, cd.padH, pa, dur);
            addRectMasks(ac, cd.accent);
        }
        if (o.clipToShape) {
            // Stencil Alpha on top cuts every block (pixel + accent) to the layer itself:
            //  - transparent shapes / PNGs → the shape's own alpha
            //  - solid images              → the card rectangle
            var stl;
            if (alpha) {
                stl = cc.layers.add(ic);
            } else {
                stl = cc.layers.addSolid([1, 1, 1], "stencil", cd.padW, cd.padH, pa, dur);
                addRectMasks(stl, [{ r: [cd.padX, cd.padY, cd.w, cd.h], keys: [[0, 100]] }]);
            }
            stl.startTime = 0;
            stl.name = "shape stencil";
            stl.blendingMode = BlendingMode.STENCIL_ALPHA;
        }
        cardComps.push(cc);
        tick("Card " + (i + 1));
    }

    // ---- host comp: the user's comp (layers mode) or a new one (project mode)
    var host, t0 = 0, created = [];
    if (o.inPlace) {
        host = o.inPlace.comp;
        t0 = Math.round(host.time * fps) / fps;
        if (t0 + dur > host.duration) { host.duration = t0 + dur; o.extended = true; }
    } else {
        host = app.project.items.addComp("BlockFlow " + stamp, o.compW, o.compH, pa, dur, fps);
        host.parentFolder = folder;
    }
    function shift(keys) {
        var out = [];
        for (var a = 0; a < keys.length; a++) { out.push([keys[a][0] + t0, keys[a][1]]); }
        return out;
    }
    for (var oi = 0; oi < plan.order.length; oi++) {
        var c = plan.cards[plan.order[oi]];
        var CL = host.layers.add(cardComps[c.index]);
        CL.name = "BF Card " + (c.index + 1) + " – " + items[c.index].name;
        CL.startTime = t0;
        CL.inPoint = t0 + c.start;
        CL.outPoint = t0 + Math.max(c.end, c.start + 1 / fps);
        var tg = CL.property("ADBE Transform Group");
        setHold(tg.property("ADBE Scale"), shift(c.scaleKeys));
        setHold(tg.property("ADBE Position"), shift(c.posKeys));
        created.push(CL);
    }
    tick("Cards placed");

    if (o.inPlace) {
        // stack the new layers right above the top-most selected layer (keeps their order)
        var ref = o.inPlace.top;
        for (var ci = created.length - 1; ci >= 0; ci--) {
            try { created[ci].moveBefore(ref); } catch (eMv) {}
        }
        if (o.hideOriginals) {
            for (var hi = 0; hi < o.inPlace.layers.length; hi++) {
                try { o.inPlace.layers[hi].enabled = false; } catch (eH) {}
            }
        }
        for (var si = 1; si <= host.numLayers; si++) { host.layer(si).selected = false; }
        for (si = 0; si < created.length; si++) { created[si].selected = true; }
    } else {
        host.openInViewer();
    }
    return host;
}


// ------------------------------------------------------------------
// Squeezy entry point (replaces the ScriptUI panel)
// ------------------------------------------------------------------
function P(k, d) { var v = params[k]; return (v === undefined || v === null || v === "") ? d : v; }
function N(k, d) { var v = parseFloat(P(k, d)); return isNaN(v) ? d : v; }
var target = comp || null;
var layerMode = !!(target && layers.length > 0);
var items = layerMode ? null : getProjectItems();
if (!layerMode && items.length < 1) {
    return "Select the layers you want in your comp (or images in the Project panel), then press Build.";
}
var o = {};
if (layerMode) { o.compW = target.width; o.compH = target.height; o.fps = target.frameRate; }
else { o.compW = target ? target.width : 1920; o.compH = target ? target.height : 1080; o.fps = target ? target.frameRate : 25; }
o.pa = target ? target.pixelAspect : 1;
o.slots = Math.max(1, Math.round(N("slots", 2)));
o.overlap = clamp(N("overlap", 12), 0, 90) / 100;
var fw = parseFloat(P("cardW", "layer")), fh = parseFloat(P("cardH", "layer"));
o.fixedSize = !isNaN(fw) && !isNaN(fh) && fw > 0 && fh > 0;
o.fixedW = o.fixedSize ? Math.round(fw) : 0; o.fixedH = o.fixedSize ? Math.round(fh) : 0;
o.cardScale = Math.max(1, N("cardScale", 100)) / 100;
o.cols = clamp(Math.round(N("cols", 8)), 1, 40);
o.pad = clamp(Math.round(N("pad", 2)), 0, 6);
o.interval = Math.max(0.04, N("interval", 0.85));
o.trans = Math.max(0.08, N("trans", 0.5));
o.zoomAmt = clamp(N("zoomAmt", 27), 0, 90) / 100;
o.seed = Math.round(N("seed", 7));
o.accentHex = String(P("accentHex", "#00D2B4"));
o.accentAmt = clamp(N("accentAmt", 35), 0, 100) / 100;
o.mosaicAmt = clamp(N("mosaicAmt", 40), 0, 100) / 100;
o.mosaicDetail = clamp(Math.round(N("mosaicDetail", 2)), 1, 6);
o.jitter = Math.max(0, N("jitter", 14));
o.holdEnd = Math.max(0, N("holdEnd", 1));
o.clipToShape = !!params.clipToShape;
o.exitAtEnd = !!params.exitAtEnd;
o.rightOnTop = !!params.rightOnTop;
o.hideOriginals = !!params.hideOriginals;
o.reverseOrder = !!params.reverseOrder;
o.inPlace = null;

var t0 = new Date().getTime();
if (layerMode) {
    var res = resolveLayers(target, o.reverseOrder, layers);
    items = res.items;
    o.inPlace = { comp: target, layers: res.layers, top: res.top };
}
o.sizes = cardSizes(items, layerMode ? o.inPlace.layers : null, o, layerMode ? target.time : 0);
var host = build(items, o, null);
var secs = Math.round((new Date().getTime() - t0) / 100) / 10;
return (layerMode
    ? "Block Flow: " + items.length + " cards from the playhead (" + secs + "s)"
    : "Block Flow: new comp \"" + host.name + "\" from " + items.length + " images (" + secs + "s)")
    + (o.extended ? ". Comp was lengthened to fit." : "");
