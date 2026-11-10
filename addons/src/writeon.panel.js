// Squeezy add-on: Arabic Write-On (panel side). Body of function(api).
// The host turns the text into shapes and hands back every path; here we find the pieces
// (joined letters), the marks (dots, hamza, shadda, harakat), trace a centre line through each
// piece, size the brush to fill it and time everything right to left.
var WO = {};

function flatten(p, tol) {
    var v = p.v, I = p.i, O = p.o, n = v.length, out = [];
    if (!n) return out;
    var segs = p.c === false ? n - 1 : n;
    out.push([v[0][0], v[0][1]]);
    for (var k = 0; k < segs; k++) {
        var a = v[k], b = v[(k + 1) % n];
        var p1 = [a[0] + O[k][0], a[1] + O[k][1]], p2 = [b[0] + I[(k + 1) % n][0], b[1] + I[(k + 1) % n][1]];
        var L = Math.abs(p1[0] - a[0]) + Math.abs(p1[1] - a[1]) + Math.abs(p2[0] - p1[0]) + Math.abs(p2[1] - p1[1]) + Math.abs(b[0] - p2[0]) + Math.abs(b[1] - p2[1]);
        var m = Math.max(1, Math.min(48, Math.ceil(L / tol)));
        var straight = !O[k][0] && !O[k][1] && !I[(k + 1) % n][0] && !I[(k + 1) % n][1];
        if (straight) m = 1;
        for (var j = 1; j <= m; j++) {
            var t = j / m, u = 1 - t;
            out.push([u * u * u * a[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * b[0],
                u * u * u * a[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * b[1]]);
        }
    }
    if (out.length > 1) { var f = out[0], l = out[out.length - 1]; if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) out.pop(); }
    return out;
}
function area(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function bbox(P) { var b = [1e9, 1e9, -1e9, -1e9]; for (var i = 0; i < P.length; i++) { var p = P[i]; if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; } return b; }
function inside(P, x, y) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
        var a = P[i], b = P[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
}
function bbHit(a, b, e) { return a[0] - e <= b[2] && b[0] - e <= a[2] && a[1] - e <= b[3] && b[1] - e <= a[3]; }
function probes(P, n) { var out = [], st = Math.max(1, Math.floor(P.length / n)); for (var i = 0; i < P.length && out.length < n; i += st) out.push(P[i]); return out; }
// does contour a lie inside contour b (most of a's points inside b, b clearly bigger)
function within(a, b) {
    if (Math.abs(b.area) < Math.abs(a.area) * 1.05 || !bbHit(a.bb, b.bb, 0)) return false;
    if (a.bb[0] < b.bb[0] || a.bb[2] > b.bb[2] || a.bb[1] < b.bb[1] || a.bb[3] > b.bb[3]) return false;
    var pr = probes(a.poly, 8), k = 0;
    for (var i = 0; i < pr.length; i++) if (inside(b.poly, pr[i][0], pr[i][1])) k++;
    return k >= Math.ceil(pr.length * 0.75);
}
function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function cross(p, q, r, t) { var d1 = orient(p, q, r), d2 = orient(p, q, t), d3 = orient(r, t, p), d4 = orient(r, t, q); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)); }
function touch(A, B, eps) {
    if (!bbHit(A.bb, B.bb, eps)) return false;
    var i, j, a = A.outer.poly, b = B.outer.poly;
    for (i = 0; i < a.length; i++) if (inside(b, a[i][0], a[i][1])) return true;
    for (i = 0; i < b.length; i++) if (inside(a, b[i][0], b[i][1])) return true;
    for (i = 0; i < a.length; i++) {
        var p = a[i], q = a[(i + 1) % a.length];
        if (Math.max(p[0], q[0]) < B.bb[0] || Math.min(p[0], q[0]) > B.bb[2] || Math.max(p[1], q[1]) < B.bb[1] || Math.min(p[1], q[1]) > B.bb[3]) continue;
        for (j = 0; j < b.length; j++) if (cross(p, q, b[j], b[(j + 1) % b.length])) return true;
    }
    var e2 = eps * eps;
    for (i = 0; i < a.length; i++) {
        if (a[i][0] < B.bb[0] - eps || a[i][0] > B.bb[2] + eps || a[i][1] < B.bb[1] - eps || a[i][1] > B.bb[3] + eps) continue;
        for (j = 0; j < b.length; j++) { var dx = a[i][0] - b[j][0], dy = a[i][1] - b[j][1]; if (dx * dx + dy * dy < e2) return true; }
    }
    return false;
}

// contours -> components (outer + its holes) -> bodies / marks -> pieces (bodies that touch)
WO.classify = function (paths, em, shape) {
    var tol = em / 60, C = [], i, j;
    for (i = 0; i < paths.length; i++) {
        var poly = flatten(paths[i], tol);
        if (poly.length < 3) continue;
        C.push({ ref: paths[i].ref, poly: poly, area: area(poly), bb: bbox(poly), parent: -1 });
    }
    for (i = 0; i < C.length; i++) {
        var best = -1;
        // a hole runs the other way round than the shape around it (fonts overlap same-way contours to join strokes)
        for (j = 0; j < C.length; j++) if (i !== j && (C[i].area > 0) !== (C[j].area > 0) && within(C[i], C[j]) && (best < 0 || Math.abs(C[j].area) < Math.abs(C[best].area))) best = j;
        C[i].parent = best;
    }
    var comps = [], byOuter = {};
    for (i = 0; i < C.length; i++) if (C[i].parent < 0 || C[C[i].parent].parent >= 0) { byOuter[i] = comps.length; comps.push({ outer: C[i], holes: [], refs: [C[i].ref] }); }
    for (i = 0; i < C.length; i++) if (byOuter[i] === undefined && byOuter[C[i].parent] !== undefined) { var cp = comps[byOuter[C[i].parent]]; cp.holes.push(C[i]); cp.refs.push(C[i].ref); }
    for (i = 0; i < comps.length; i++) {
        var c = comps[i], ar = Math.abs(c.outer.area);
        for (j = 0; j < c.holes.length; j++) ar -= Math.abs(c.holes[j].area);
        c.area = ar; c.bb = c.outer.bb; c.w = c.bb[2] - c.bb[0]; c.h = c.bb[3] - c.bb[1];
        c.cx = (c.bb[0] + c.bb[2]) / 2; c.cy = (c.bb[1] + c.bb[3]) / 2;
        c.small = Math.max(c.w, c.h) < 0.45 * em && c.area < 0.05 * em * em;
        c.tiny = Math.max(c.w, c.h) < 0.32 * em && c.area < 0.045 * em * em;   // dot / hamza / shadda / haraka size
        // text: one group per character. a shape layer has no characters, so every contour is its own
        c.group = shape ? c.outer.ref.join(".") : c.outer.ref.slice(0, -1).join(".");
    }
    // the biggest shape of every character is its letter (or a lone mark), the rest are dots / hamza
    var big = {};
    for (i = 0; i < comps.length; i++) { var g = comps[i].group; if (!big[g] || comps[i].area > big[g].area) big[g] = comps[i]; }
    for (i = 0; i < comps.length; i++) comps[i].anchor = !comps[i].small || big[comps[i].group] === comps[i];
    // shapes that touch are one piece (joined letters overlap or meet)
    var up = []; for (i = 0; i < comps.length; i++) up.push(i);
    function find(k) { while (up[k] !== k) { up[k] = up[up[k]]; k = up[k]; } return k; }
    var eps = em * 0.015;
    for (i = 0; i < comps.length; i++) for (j = i + 1; j < comps.length; j++)
        if (find(i) !== find(j) && touch(comps[i], comps[j], eps)) up[find(i)] = find(j);
    // parts of one letter stay together (a Kufi taa marbuta, a broken stroke)
    for (i = 0; i < comps.length; i++) if (!comps[i].tiny) for (j = i + 1; j < comps.length; j++)
        if (!comps[j].tiny && comps[j].group === comps[i].group && find(i) !== find(j)) up[find(i)] = find(j);
    // touching sets: a set is a letter body if it has a big shape, a shape bigger than a mark,
    // or is too wide for a mark (joined small Kufi letters)
    var sets = {}, setList = [];
    for (i = 0; i < comps.length; i++) {
        var rt = find(i), S0 = sets[rt];
        if (!S0) { S0 = sets[rt] = { comps: [], bb: [1e9, 1e9, -1e9, -1e9], body: false }; setList.push(S0); }
        S0.comps.push(comps[i]); comps[i].set = S0;
        var q0 = comps[i].bb; S0.bb = [Math.min(S0.bb[0], q0[0]), Math.min(S0.bb[1], q0[1]), Math.max(S0.bb[2], q0[2]), Math.max(S0.bb[3], q0[3])];
        if (!comps[i].tiny) S0.body = true;
    }
    for (i = 0; i < setList.length; i++) {
        var sb = setList[i].bb; setList[i].cx = (sb[0] + sb[2]) / 2;
        if (Math.max(sb[2] - sb[0], sb[3] - sb[1]) >= 0.36 * em) setList[i].body = true;
    }
    // a small free shape floating over or under a letter is a mark
    function floats(s, o) {
        if (s.cx < o.bb[0] - 0.06 * em || s.cx > o.bb[2] + 0.06 * em) return false;
        var P = o.outer.poly, ys = [];
        for (var a = 0, z = P.length - 1; a < P.length; z = a++) {
            var A = P[a], B = P[z];
            if ((A[0] > s.cx) !== (B[0] > s.cx)) ys.push(A[1] + (s.cx - A[0]) * (B[1] - A[1]) / (B[0] - A[0]));
        }
        ys.sort(function (m, n) { return m - n; });
        if (ys.length < 2) return true;
        for (var q = 0; q + 1 < ys.length; q += 2) if (s.bb[1] < ys[q + 1] + eps && s.bb[3] > ys[q] - eps) return false;
        return true;
    }
    var marks = [], pieces = [];
    for (i = 0; i < setList.length; i++) {
        var st = setList[i], isMark = false;
        if (!st.body) {
            var probe = { cx: st.cx, bb: st.bb };
            for (j = 0; j < comps.length; j++) {
                var o = comps[j];
                if (o.set === st || !o.anchor || o.small && !o.set.body) continue;
                if (floats(probe, o)) { isMark = true; break; }
            }
        }
        if (isMark) {
            var rf = []; for (j = 0; j < st.comps.length; j++) rf = rf.concat(st.comps[j].refs);
            marks.push({ refs: rf, bb: st.bb, cx: st.cx, cy: (st.bb[1] + st.bb[3]) / 2 });
        } else pieces.push({ comps: st.comps });
    }
    for (i = 0; i < pieces.length; i++) {
        var P = pieces[i], b = [1e9, 1e9, -1e9, -1e9]; P.refs = [];
        for (j = 0; j < P.comps.length; j++) {
            var q = P.comps[j].bb; b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])];
            P.refs = P.refs.concat(P.comps[j].refs);
        }
        P.bb = b; P.cy = (b[1] + b[3]) / 2;
    }
    // reading order: lines top to bottom (pieces that share most of their height), then right to left
    pieces.sort(function (a, b) { return a.cy - b.cy; });
    var lines = [];
    for (i = 0; i < pieces.length; i++) {
        var pc = pieces[i], hit = null;
        for (j = 0; j < lines.length && !hit; j++) {
            var ov = Math.min(lines[j].y1, pc.bb[3]) - Math.max(lines[j].y0, pc.bb[1]);
            if (ov > 0.4 * Math.min(lines[j].core, pc.bb[3] - pc.bb[1])) hit = lines[j];
        }
        if (hit) { hit.items.push(pc); hit.y0 = Math.min(hit.y0, pc.bb[1]); hit.y1 = Math.max(hit.y1, pc.bb[3]); }
        else lines.push({ y0: pc.bb[1], y1: pc.bb[3], core: pc.bb[3] - pc.bb[1], items: [pc] });
    }
    // shape layers: a short "line" made of small bits floating just over / under a real line belongs to it
    // (a dagger alef or a long haraka drawn as a shape), so it is written with that line, not before it
    if (shape && lines.length > 1) {
        var maxCore = 0;
        for (i = 0; i < lines.length; i++) maxCore = Math.max(maxCore, lines[i].y1 - lines[i].y0);
        var span = function (ln) { var x0 = 1e9, x1 = -1e9; for (var q = 0; q < ln.items.length; q++) { x0 = Math.min(x0, ln.items[q].bb[0]); x1 = Math.max(x1, ln.items[q].bb[2]); } return [x0, x1]; };
        for (i = lines.length - 1; i >= 0; i--) {
            var sl = lines[i]; if (sl.y1 - sl.y0 >= 0.45 * maxCore) continue;
            var sx = span(sl), host = null, hd = 1e18;
            for (j = 0; j < lines.length; j++) {
                var hl = lines[j]; if (j === i || hl.y1 - hl.y0 < 0.45 * maxCore) continue;
                var hx = span(hl); if (sx[1] < hx[0] || sx[0] > hx[1]) continue;
                var gap = Math.max(0, Math.max(hl.y0 - sl.y1, sl.y0 - hl.y1));
                if (gap < 0.5 * maxCore && gap < hd) { hd = gap; host = hl; }
            }
            if (host) { host.items = host.items.concat(sl.items); host.y0 = Math.min(host.y0, sl.y0); host.y1 = Math.max(host.y1, sl.y1); lines.splice(i, 1); }
        }
    }
    lines.sort(function (a, b) { return (a.y0 + a.y1) - (b.y0 + b.y1); });
    var ordered = [];
    for (i = 0; i < lines.length; i++) { lines[i].items.sort(function (a, b) { return b.bb[2] - a.bb[2]; }); ordered = ordered.concat(lines[i].items); }
    return { pieces: ordered, marks: marks };
};

// ---------------------------------------------------------------- raster + skeleton
function raster(piece, em, quality) {
    var b = piece.bb, w = b[2] - b[0], h = b[3] - b[1];
    var k = (quality || 120) / em;
    if (w * h * k * k > 700000) k = Math.sqrt(700000 / (w * h));
    var pad = 3, W = Math.ceil(w * k) + pad * 2, H = Math.ceil(h * k) + pad * 2, G = new Uint8Array(W * H);
    var x0 = b[0] - pad / k, y0 = b[1] - pad / k, E = [];
    for (var c = 0; c < piece.comps.length; c++) {
        var cp = piece.comps[c], polys = [cp.outer].concat(cp.holes);
        for (var p = 0; p < polys.length; p++) {
            var P = polys[p].poly;
            // orientation: outers count +1, holes -1 (nonzero fill, overlapping letters stay filled)
            var flip = (polys[p].area > 0) !== (polys[p] === cp.outer);
            for (var i = 0; i < P.length; i++) {
                var A = P[i], B = P[(i + 1) % P.length];
                var ax = (A[0] - x0) * k, ay = (A[1] - y0) * k, bx = (B[0] - x0) * k, by = (B[1] - y0) * k;
                if (ay === by) continue;
                var d = by > ay ? 1 : -1; if (flip) d = -d;
                E.push([ax, ay, bx, by, d]);
            }
        }
    }
    var xs = [];
    for (var y = 0; y < H; y++) {
        var yc = y + 0.5; xs.length = 0;
        for (var e = 0; e < E.length; e++) {
            var q = E[e];
            if ((q[1] <= yc) !== (q[3] <= yc)) xs.push([q[0] + (yc - q[1]) * (q[2] - q[0]) / (q[3] - q[1]), q[4]]);
        }
        xs.sort(function (m, n) { return m[0] - n[0]; });
        var wn = 0;
        for (var s = 0; s < xs.length; s++) {
            var prev = wn; wn += xs[s][1];
            if (prev !== 0 && s > 0) {
                var from = Math.max(0, Math.ceil(xs[s - 1][0] - 0.5)), to = Math.min(W - 1, Math.floor(xs[s][0] - 0.5));
                for (var xx = from; xx <= to; xx++) G[y * W + xx] = 1;
            }
        }
    }
    return { G: G, W: W, H: H, k: k, x0: x0, y0: y0 };
}
// exact squared distance to the nearest empty pixel (Felzenszwalb)
function edt(R) {
    var W = R.W, H = R.H, G = R.G, INF = 1e12, D = new Float64Array(W * H), f = new Float64Array(Math.max(W, H)), d = new Float64Array(Math.max(W, H));
    var v = new Int32Array(Math.max(W, H)), z = new Float64Array(Math.max(W, H) + 1);
    function dt1(n) {
        var kk = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
        for (var q = 1; q < n; q++) {
            var s = ((f[q] + q * q) - (f[v[kk]] + v[kk] * v[kk])) / (2 * q - 2 * v[kk]);
            while (s <= z[kk]) { kk--; s = ((f[q] + q * q) - (f[v[kk]] + v[kk] * v[kk])) / (2 * q - 2 * v[kk]); }
            kk++; v[kk] = q; z[kk] = s; z[kk + 1] = INF;
        }
        kk = 0;
        for (var q2 = 0; q2 < n; q2++) { while (z[kk + 1] < q2) kk++; d[q2] = (q2 - v[kk]) * (q2 - v[kk]) + f[v[kk]]; }
    }
    for (var x = 0; x < W; x++) { for (var y = 0; y < H; y++) f[y] = G[y * W + x] ? INF : 0; dt1(H); for (var y2 = 0; y2 < H; y2++) D[y2 * W + x] = d[y2]; }
    for (var y3 = 0; y3 < H; y3++) { for (var x2 = 0; x2 < W; x2++) f[x2] = D[y3 * W + x2]; dt1(W); for (var x3 = 0; x3 < W; x3++) D[y3 * W + x3] = d[x3]; }
    return D;
}
function thin(R) {
    var W = R.W, H = R.H, S = new Uint8Array(R.G), changed = true, del = [];
    function at(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? 0 : S[y * W + x]; }
    while (changed) {
        changed = false;
        for (var pass = 0; pass < 2; pass++) {
            del.length = 0;
            for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
                if (!S[y * W + x]) continue;
                var p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
                var B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                if (B < 2 || B > 6) continue;
                var A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
                if (A !== 1) continue;
                if (pass === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
                del.push(y * W + x);
            }
            for (var i = 0; i < del.length; i++) S[del[i]] = 0;
            if (del.length) changed = true;
        }
    }
    return S;
}
var NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function nbrs(S, W, H, idx) {
    var x = idx % W, y = (idx - x) / W, out = [];
    for (var i = 0; i < 8; i++) { var nx = x + NB[i][0], ny = y + NB[i][1]; if (nx >= 0 && ny >= 0 && nx < W && ny < H && S[ny * W + nx]) out.push(ny * W + nx); }
    return out;
}
// cut short side twigs the thinning leaves at corners
function prune(S, W, H, D, k) {
    for (var round = 0; round < 3; round++) {
        var cut = 0;
        for (var idx = 0; idx < S.length; idx++) {
            if (!S[idx] || nbrs(S, W, H, idx).length !== 1) continue;
            var trail = [idx], seen = {}, cur = idx, ok = false; seen[idx] = 1;
            while (trail.length < 400) {
                var nb = nbrs(S, W, H, cur).filter(function (q) { return !seen[q]; });
                if (nb.length === 0) break;                    // reached another end: a whole stroke, keep it
                if (nb.length > 1) { ok = true; var jn = cur; trail.pop(); break; }          // we are standing on the fork
                if (nbrs(S, W, H, nb[0]).length >= 3) { ok = true; jn = nb[0]; break; }
                cur = nb[0]; seen[cur] = 1; trail.push(cur);
            }
            if (!ok) continue;
            var lim = Math.sqrt(D[jn]) * 1.6 + 1;
            if (trail.length <= lim) { for (var t = 0; t < trail.length; t++) S[trail[t]] = 0; cut++; }
        }
        if (!cut) break;
    }
}
function rdp(P, eps) {
    if (P.length < 3) return P.slice();
    var keep = new Uint8Array(P.length), st = [[0, P.length - 1]]; keep[0] = keep[P.length - 1] = 1;
    while (st.length) {
        var s = st.pop(), a = P[s[0]], b = P[s[1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy), bi = -1, bd = eps;
        for (var i = s[0] + 1; i < s[1]; i++) {
            var d = L > 1e-9 ? Math.abs(dy * P[i][0] - dx * P[i][1] + b[0] * a[1] - b[1] * a[0]) / L : Math.sqrt(Math.pow(P[i][0] - a[0], 2) + Math.pow(P[i][1] - a[1], 2));
            if (d > bd) { bd = d; bi = i; }
        }
        if (bi > 0) { keep[bi] = 1; st.push([s[0], bi]); st.push([bi, s[1]]); }
    }
    var out = []; for (var j = 0; j < P.length; j++) if (keep[j]) out.push(P[j]);
    return out;
}
// soften the pixel stair-steps, keep both ends where they are
function smooth(P, n) {
    var A = P;
    for (var r = 0; r < n; r++) {
        var B = [A[0]];
        for (var i = 1; i < A.length - 1; i++) B.push([(A[i - 1][0] + 2 * A[i][0] + A[i + 1][0]) / 4, (A[i - 1][1] + 2 * A[i][1] + A[i + 1][1]) / 4]);
        if (A.length > 1) B.push(A[A.length - 1]);
        A = B;
    }
    return A;
}
function bez(P) {
    var v = [], I = [], O = [], n = P.length;
    for (var i = 0; i < n; i++) {
        var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], tx = (b[0] - a[0]) / 6, ty = (b[1] - a[1]) / 6;
        // keep the turn-back points sharp (the pen goes back along the same line)
        if (i > 0 && i < n - 1) {
            var ux = P[i][0] - a[0], uy = P[i][1] - a[1], wx = b[0] - P[i][0], wy = b[1] - P[i][1];
            if (ux * wx + uy * wy < 0 && Math.abs(ux * wy - uy * wx) < 0.5 * Math.sqrt((ux * ux + uy * uy) * (wx * wx + wy * wy))) { tx = 0; ty = 0; }
        }
        if (i === 0 || i === n - 1) { tx = 0; ty = 0; }
        v.push([P[i][0], P[i][1]]); I.push([-tx, -ty]); O.push([tx, ty]);
    }
    return { v: v, i: I, o: O, c: false };
}

// one piece -> centre line(s) the brush follows + brush size
WO.trace = function (piece, em, opt) {
    opt = opt || {};
    var R = raster(piece, em, opt.quality), W = R.W, H = R.H, D = edt(R), S = thin(R);
    prune(S, W, H, D, R.k);
    // a round blob (a dot, a circle shape) can thin away to nothing: keep its centre so the brush stamps it
    var anyS = false; for (var q0 = 0; q0 < S.length && !anyS; q0++) if (S[q0]) anyS = true;
    if (!anyS) { var bi0 = -1, bd0 = -1; for (var q1 = 0; q1 < D.length; q1++) if (R.G[q1] && D[q1] > bd0) { bd0 = D[q1]; bi0 = q1; } if (bi0 >= 0) S[bi0] = 1; }
    var seenC = new Uint8Array(W * H), comps = [];
    for (var idx = 0; idx < S.length; idx++) {
        if (!S[idx] || seenC[idx]) continue;
        var q = [idx], all = []; seenC[idx] = 1;
        while (q.length) { var c = q.pop(); all.push(c); var nb = nbrs(S, W, H, c); for (var j = 0; j < nb.length; j++) if (!seenC[nb[j]]) { seenC[nb[j]] = 1; q.push(nb[j]); } }
        comps.push(all);
    }
    var radii = [], strokes = [];
    for (var ci = 0; ci < comps.length; ci++) {
        var pix = comps[ci];
        if (pix.length < 2 && comps.length > 1) continue;
        // start where an Arabic hand starts: the right-most end (top-most if several are close)
        // (the right-most pixel when no free end is near it, e.g. the loop of a fa)
        var mxAll = -1; for (var e0 = 0; e0 < pix.length; e0++) mxAll = Math.max(mxAll, pix[e0] % W);
        var ends = pix.filter(function (p) { return nbrs(S, W, H, p).length === 1 && p % W >= mxAll - 0.3 * em * R.k; });
        if (!ends.length) ends = pix.filter(function (p) { return p % W >= mxAll - 1; });
        var mx = -1; for (var e = 0; e < ends.length; e++) mx = Math.max(mx, ends[e] % W);
        var start = -1, sy = 1e9;
        for (var e2 = 0; e2 < ends.length; e2++) { var ex = ends[e2] % W, ey = (ends[e2] - ex) / W; if (ex >= mx - 0.15 * em * R.k && ey < sy) { sy = ey; start = ends[e2]; } }
        // BFS tree, then a walk: short branches first (out and back), the longest branch last
        var par = {}, kids = {}, order = [start]; par[start] = -1;
        for (var h = 0; h < order.length; h++) {
            var nn = nbrs(S, W, H, order[h]);
            nn.sort(function (a, b) { return (Math.abs(a - order[h]) === 1 || Math.abs(a - order[h]) === W ? 0 : 1) - (Math.abs(b - order[h]) === 1 || Math.abs(b - order[h]) === W ? 0 : 1); });
            kids[order[h]] = [];
            for (var m = 0; m < nn.length; m++) if (par[nn[m]] === undefined) { par[nn[m]] = order[h]; kids[order[h]].push(nn[m]); order.push(nn[m]); }
        }
        var hgt = {};
        for (var o = order.length - 1; o >= 0; o--) { var n0 = order[o], best = 0, ks = kids[n0]; for (var kq = 0; kq < ks.length; kq++) best = Math.max(best, hgt[ks[kq]] + 1); hgt[n0] = best; }
        for (var o2 = 0; o2 < order.length; o2++) kids[order[o2]].sort(function (a, b) { return hgt[a] - hgt[b]; });
        var walk = [], st = [[start, true, -1]];
        while (st.length) {
            var f = st[st.length - 1];
            if (f[2] === -1) { walk.push(f[0]); f[2] = 0; }
            var kk = kids[f[0]];
            if (f[2] < kk.length) { var jj = f[2]++; st.push([kk[jj], f[1] && jj === kk.length - 1, -1]); }
            else { st.pop(); if (st.length) { var pf = st[st.length - 1]; if (!(pf[1] && pf[2] === kids[pf[0]].length)) walk.push(pf[0]); } }
        }
        var pts = [], nw = [], seenW = {};
        for (var w = 0; w < walk.length; w++) {
            var wx = walk[w] % W, wy = (walk[w] - wx) / W;
            pts.push([R.x0 + (wx + 0.5) / R.k, R.y0 + (wy + 0.5) / R.k]); nw.push(!seenW[walk[w]]); seenW[walk[w]] = 1;
        }
        for (var r = 0; r < pix.length; r++) radii.push(Math.sqrt(D[pix[r]]) / R.k);
        if (pts.length === 1) { pts.push([pts[0][0] - 0.5 / R.k, pts[0][1]]); nw.push(true); }
        strokes.push({ raw: pts, nw: nw });
    }
    strokes.sort(function (a, b) { return b.raw[0][0] - a.raw[0][0]; });   // several lines in one piece: right one first
    radii.sort(function (a, b) { return a - b; });
    var r90 = radii.length ? radii[Math.floor(radii.length * 0.9)] : em * 0.05;
    var brush = 2 * r90 * 1.2 + 1 / R.k;
    // Each stroke becomes: smooth runs (new ink / going back over ink), resampled at an even spacing so the
    // pen moves at one speed, plus a table that lets the pen skip the going-back parts in no time.
    var inked = new Uint8Array(W * H);
    var masks = [], total = 0, ftotal = 0, table = [[0, 0]], step = Math.max(2 / R.k, Math.min(brush * 0.55, em * 0.09));
    for (var s2 = 0; s2 < strokes.length; s2++) {
        var S1 = strokes[s2], P0 = S1.raw, runs = [], from = 0;
        for (var i1 = 2; i1 <= P0.length; i1++) if (i1 === P0.length || S1.nw[i1] !== S1.nw[i1 - 1]) { runs.push({ a: from, b: i1 - 1, fwd: S1.nw[i1 - 1] !== false }); from = i1 - 1; }
        if (!runs.length) runs.push({ a: 0, b: P0.length - 1, fwd: true });
        var sm = [], cuts = [];
        for (var q1 = 0; q1 < runs.length; q1++) {
            var seg = smooth(P0.slice(runs[q1].a, runs[q1].b + 1), 4);
            if (sm.length) seg = seg.slice(1);
            runs[q1].i0 = Math.max(0, sm.length - 1); sm = sm.concat(seg); runs[q1].i1 = sm.length - 1;
        }
        var cum = [0]; for (var u = 1; u < sm.length; u++) cum.push(cum[u - 1] + Math.sqrt(Math.pow(sm[u][0] - sm[u - 1][0], 2) + Math.pow(sm[u][1] - sm[u - 1][1], 2)));
        var L1 = cum[cum.length - 1];
        // ink along the path: walk the brush over the letter and count only the steps that show new ink
        // (going back over drawn parts, or brushing where the brush already reached, costs no time)
        var F = [0], rpx = brush / 2 * R.k, rr2 = rpx * rpx, need = Math.max(1, 0.25 * r90 * R.k), dead = [];
        for (var u2 = 0; u2 < sm.length; u2++) {
            var cx0 = (sm[u2][0] - R.x0) * R.k, cy0 = (sm[u2][1] - R.y0) * R.k, nn = 0;
            for (var yy = Math.max(0, Math.floor(cy0 - rpx)); yy <= Math.min(H - 1, Math.ceil(cy0 + rpx)); yy++)
                for (var xx = Math.max(0, Math.floor(cx0 - rpx)); xx <= Math.min(W - 1, Math.ceil(cx0 + rpx)); xx++) {
                    var id = yy * W + xx;
                    if (R.G[id] && !inked[id] && (xx + 0.5 - cx0) * (xx + 0.5 - cx0) + (yy + 0.5 - cy0) * (yy + 0.5 - cy0) <= rr2) { inked[id] = 1; nn++; }
                }
            dead.push(u2 > 0 && nn < need);
            if (u2 > 0) F.push(F[u2 - 1] + (dead[u2] ? 0 : cum[u2] - cum[u2 - 1]));
        }
        // stretches with no new ink longer than a quarter brush become jumps in the table
        var skips = [];
        for (var u3 = 1; u3 < sm.length; u3++) {
            if (!dead[u3]) continue;
            var e3 = u3; while (e3 + 1 < sm.length && dead[e3 + 1]) e3++;
            if (cum[e3] - cum[u3 - 1] > brush * 0.25) skips.push([u3 - 1, e3]);
            else for (var z3 = u3; z3 <= e3; z3++) F[z3] = F[z3 - 1] + cum[z3] - cum[z3 - 1];
            if (e3 + 1 < sm.length) F[e3 + 1] = F[e3] + cum[e3 + 1] - cum[e3];
            // keep F running after the stretch
            for (var z4 = e3 + 1; z4 < sm.length && z4 <= e3 + 1; z4++) {}
            u3 = e3;
        }
        // rebuild F cleanly from the skip list
        F = [0]; var sk = 0;
        for (var u4 = 1; u4 < sm.length; u4++) {
            while (sk < skips.length && u4 > skips[sk][1]) sk++;
            var inSkip = sk < skips.length && u4 > skips[sk][0] && u4 <= skips[sk][1];
            F.push(F[u4 - 1] + (inSkip ? 0 : cum[u4] - cum[u4 - 1]));
        }
        for (var q2 = 0; q2 < runs.length; q2++) runs[q2].skip = !runs[q2].fwd && cum[runs[q2].i1] - cum[runs[q2].i0] > step * 0.5;
        // even samples + the turn-back points
        var want = [];
        for (var d1 = 0; d1 < L1; d1 += step) want.push(d1);
        want.push(L1);
        for (var q3 = 0; q3 < runs.length; q3++) if (runs[q3].skip) { cuts.push(cum[runs[q3].i0]); cuts.push(cum[runs[q3].i1]); }
        want = want.filter(function (d) { for (var c = 0; c < cuts.length; c++) if (Math.abs(d - cuts[c]) < step * 0.35 && d !== 0 && d !== L1) return false; return true; }).concat(cuts);
        want.sort(function (x, y) { return x - y; });
        var smp = [], at = [], k1 = 0, lastD = -1;
        for (var d2 = 0; d2 < want.length; d2++) {
            var dd = want[d2]; if (dd - lastD < 1e-6) continue; lastD = dd; at.push(dd);
            while (k1 < cum.length - 2 && cum[k1 + 1] < dd) k1++;
            var sl = cum[k1 + 1] - cum[k1], tf = sl > 0 ? (dd - cum[k1]) / sl : 0;
            smp.push([sm[k1][0] + (sm[k1 + 1 < sm.length ? k1 + 1 : k1][0] - sm[k1][0]) * tf, sm[k1][1] + (sm[k1 + 1 < sm.length ? k1 + 1 : k1][1] - sm[k1][1]) * tf]);
        }
        if (smp.length < 2) { smp = [sm[0], sm[sm.length - 1]]; at = [0, L1]; }
        var mk = bez(smp); masks.push(mk);
        // the length AE will measure is the mask's, not the pixel trail's: map trail distance -> mask distance
        var Bc = [0];
        for (var j5 = 0; j5 < mk.v.length - 1; j5++) {
            var A5 = mk.v[j5], B5 = mk.v[j5 + 1], C1 = [A5[0] + mk.o[j5][0], A5[1] + mk.o[j5][1]], C2 = [B5[0] + mk.i[j5 + 1][0], B5[1] + mk.i[j5 + 1][1]], pl = A5, ln = 0;
            for (var t5 = 1; t5 <= 12; t5++) { var tt5 = t5 / 12, uu = 1 - tt5, q5 = [uu * uu * uu * A5[0] + 3 * uu * uu * tt5 * C1[0] + 3 * uu * tt5 * tt5 * C2[0] + tt5 * tt5 * tt5 * B5[0], uu * uu * uu * A5[1] + 3 * uu * uu * tt5 * C1[1] + 3 * uu * tt5 * tt5 * C2[1] + tt5 * tt5 * tt5 * B5[1]]; ln += Math.sqrt((q5[0] - pl[0]) * (q5[0] - pl[0]) + (q5[1] - pl[1]) * (q5[1] - pl[1])); pl = q5; }
            Bc.push(Bc[j5] + ln);
        }
        var toB = function (d) { var j = 0; while (j < at.length - 2 && at[j + 1] < d) j++; var sp = at[j + 1] - at[j]; return Bc[j] + (Bc[j + 1] - Bc[j]) * (sp > 0 ? Math.min(1, Math.max(0, (d - at[j]) / sp)) : 0); };
        var LB = Bc[Bc.length - 1];
        // table rows: [ink so far, path so far], in units for now
        for (var q4 = 0; q4 < skips.length; q4++) {
            table.push([ftotal + F[skips[q4][0]], total + toB(cum[skips[q4][0]])]);
            table.push([ftotal + F[skips[q4][1]], total + toB(cum[skips[q4][1]])]);
        }
        S1.pts = sm; S1.cum = cum; S1.F = F; S1.len = LB; S1.ink = F[F.length - 1]; S1.base = ftotal;
        total += LB; ftotal += S1.ink;
    }
    table.push([ftotal, total]);
    for (var t1 = 0; t1 < table.length; t1++) table[t1] = [Math.round(table[t1][0] / Math.max(ftotal, 1e-9) * 1e4) / 1e4, Math.round(table[t1][1] / Math.max(total, 1e-9) * 1e4) / 1e4];
    return { strokes: strokes, masks: masks, brush: brush, len: total, ink: ftotal, remap: table.length > 2 ? table : null, raster: R };
};

// where along the piece (0..1) the pen passes closest to a point
WO.reach = function (tr, x, y) {
    var best = 1e18, at = 0;
    for (var s = 0; s < tr.strokes.length; s++) {
        var st = tr.strokes[s];
        for (var i = 0; i < st.pts.length; i++) {
            var dx = st.pts[i][0] - x, dy = st.pts[i][1] - y, d = dx * dx + dy * dy;
            if (d < best - 1e-9) { best = d; at = st.base + st.F[i]; }
        }
    }
    return { frac: tr.ink > 0 ? at / tr.ink : 0, dist: Math.sqrt(best) };
};

function r2(m) {
    function f(a) { return a.map(function (p) { return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]; }); }
    return { v: f(m.v), i: f(m.i), o: f(m.o), c: false };
}
// a shape layer has no font size: take it from its main shapes (the ones that make most of the ink)
WO.em = function (paths) {
    var bb = [1e9, 1e9, -1e9, -1e9], i;
    for (i = 0; i < paths.length; i++) for (var k = 0; k < paths[i].v.length; k++) {
        var q = paths[i].v[k]; bb = [Math.min(bb[0], q[0]), Math.min(bb[1], q[1]), Math.max(bb[2], q[0]), Math.max(bb[3], q[1])];
    }
    var Hh = Math.max(1, bb[3] - bb[1]), tol = Math.max(0.01, Math.sqrt(Math.pow(bb[2] - bb[0], 2) + Hh * Hh) / 400), C = [], tot = 0;
    for (i = 0; i < paths.length; i++) { var P = flatten(paths[i], tol); if (P.length < 3) continue; var a = Math.abs(area(P)), b = bbox(P); C.push({ a: a, h: b[3] - b[1] }); tot += a; }
    if (!C.length) return Hh;
    C.sort(function (x, y) { return y.a - x.a; });
    var hs = [], acc = 0;
    for (i = 0; i < C.length; i++) { hs.push(C[i].h); acc += C[i].a; if (acc >= 0.8 * tot) break; }
    hs.sort(function (x, y) { return x - y; });
    return Math.min(Hh, Math.max(Hh / 8, hs[Math.floor(hs.length / 2)] * 1.7));   // main shapes run ~0.5-0.8 em tall
};
function mirror(p) {
    function f(a) { return a.map(function (q) { return [-q[0], q[1]]; }); }
    var o = {}; for (var k in p) o[k] = p[k];
    o.v = f(p.v); o.i = f(p.i); o.o = f(p.o); return o;
}
function pathLen(p) {
    var P = flatten(p, 1), L = 0;
    for (var i = 1; i < P.length; i++) L += Math.sqrt(Math.pow(P[i][0] - P[i - 1][0], 2) + Math.pow(P[i][1] - P[i - 1][1], 2));
    if (p.c !== false && P.length > 1) L += Math.sqrt(Math.pow(P[0][0] - P[P.length - 1][0], 2) + Math.pow(P[0][1] - P[P.length - 1][1], 2));
    return L;
}
WO.plan = function (info, opt) {
    var dur = Math.max(0.1, opt.duration || 2), t0 = info.t0 || 0, fd = info.fd || 1 / 30, pct = (opt.brush || 100) / 100, ltr = opt.dir === "ltr";
    function snap(t) { return Math.round(t / fd) * fd; }
    var L = [], total = 0, i, j, warn = [];
    for (i = 0; i < info.layers.length; i++) {
        var lay = info.layers[i], shape = lay.kind === "shape", paths = lay.paths || [];
        if (ltr) paths = paths.map(mirror);                 // left to right = the same pen on a mirrored drawing
        var em = shape ? WO.em(paths) : (lay.em > 0 ? lay.em : 100);
        var cl = paths.length ? WO.classify(paths, em, shape) : { pieces: [], marks: [] }, tr = [];
        var lineLen = 0, lines = lay.lines || [];
        for (j = 0; j < lines.length; j++) lineLen += pathLen(lines[j]);
        if (!cl.pieces.length && !lineLen) { if (shape) warn.push(lay.name); continue; }
        for (j = 0; j < cl.pieces.length; j++) { tr.push(WO.trace(cl.pieces[j], em, opt)); total += tr[j].ink; }
        total += lineLen;
        if (lay.repeater) warn.push(lay.name + " (Repeater copies are not drawn)");
        L.push({ lay: lay, cl: cl, tr: tr, em: em, lineLen: lineLen });
    }
    if (!L.length) throw new Error(warn.length ? "Nothing to draw in " + warn.join(", ") + ": it has no visible Fill or Stroke." : "No letters found in the selected text.");
    var out = { layers: [] }, t = t0;
    function unmirror(m) { return ltr ? mirror(m) : m; }
    for (i = 0; i < L.length; i++) {
        var o = { index: L[i].lay.index, name: L[i].lay.name, pieces: [], marks: [], lines: null }, times = [];
        for (j = 0; j < L[i].cl.pieces.length; j++) {
            var T = L[i].tr[j], d = Math.max(2 * fd, dur * (total > 0 ? T.ink / total : 1 / L[i].cl.pieces.length));
            var a = snap(t), b = Math.max(a + fd, snap(t + d)); times.push([a, b]); t += d;
            o.pieces.push({ refs: L[i].cl.pieces[j].refs, masks: T.masks.map(unmirror).map(r2), remap: T.remap, brush: Math.round(T.brush * pct * 10) / 10, t0: a, t1: b });
        }
        // each mark pops when the stroke of the closest piece reaches it
        for (j = 0; j < L[i].cl.marks.length; j++) {
            var M = L[i].cl.marks[j], bi = 0, bd = 1e18, bf = 0;
            for (var p = 0; p < L[i].tr.length; p++) { var rc = WO.reach(L[i].tr[p], M.cx, M.cy); if (rc.dist < bd) { bd = rc.dist; bi = p; bf = rc.frac; } }
            var tm = snap(times[bi][0] + bf * (times[bi][1] - times[bi][0]));
            o.marks.push({ refs: M.refs, cx: ltr ? -M.cx : M.cx, cy: M.cy, t: tm });
        }
        o.marks.sort(function (a, b) { return a.t - b.t; });
        // stroke-only paths draw after the filled shapes, one after another in stacking order
        if (L[i].lineLen > 0) {
            var dl = Math.max(2 * fd, dur * L[i].lineLen / total), la = snap(t), lb = Math.max(la + fd, snap(t + dl)); t += dl;
            o.lines = { refs: L[i].lay.lines.map(function (q) { return q.ref; }), t0: la, t1: lb };
        }
        out.layers.push(o);
    }
    if (warn.length) out.warn = warn;
    return out;
};

WO._ = { raster: raster, edt: edt, thin: thin, prune: prune, nbrs: nbrs };
if (!api || !api.run) return WO;   // tests load the geometry only

var v = api.values || {};
if (v.action === "Remove") return api.run({ phase: "remove" });
var opt = { duration: parseFloat(String(v.duration).replace(",", ".")) || 2, brush: Number(v.brush) || 100, quality: 120, dir: v.dir === "Left \u2192 Right" ? "ltr" : "rtl" };
return api.run({ phase: "read" }).then(function (r) {
    if (!r.ok) return r;
    var data;
    try { data = WO.plan(JSON.parse(r.message), opt); }
    catch (e) { return api.run({ phase: "abort" }).then(function () { return { ok: false, error: "Write-On: " + (e.message || e) }; }); }
    return api.run({ phase: "build", data: data, bounce: !!v.bounce, pop: Number(v.pop) || 0.35 });
});
