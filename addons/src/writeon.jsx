// Squeezy add-on: Arabic Write-On (host side). Runs as function(params, comp, layers).
// The panel drives it in phases:
//   phase "read"   selected Arabic text layer(s) -> AE outlines (Create Shapes from Text): returns every
//                  path in layer space + where it lives in the outlines layer (JSON string), then
//                  deletes the outlines again so nothing is left if the panel stops
//   phase "build"  gets back the pieces / marks / write paths the panel worked out, makes the outlines
//                  again (same paths, same order) and builds the rig in one undo step
//   phase "remove" deletes a Write-On's layers and shows the text again
if (!comp) throw new Error("Open a composition first.");
var TAG = "SQ Write";

function wq(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function wtr(l) { return l.property("ADBE Transform Group"); }
function isArabicText(l) {
    try { return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(l.property("ADBE Text Properties").property("ADBE Text Document").value.text)); } catch (e) { return false; }
}
// 2D affine [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f
function mMul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
function gMatrix(g) {
    var T = g.property("ADBE Vector Transform Group");
    var an = [0, 0], po = [0, 0], sc = [100, 100], ro = 0;
    try { an = T.property("ADBE Vector Anchor").value; } catch (e1) {}
    try { po = T.property("ADBE Vector Position").value; } catch (e2) {}
    try { sc = T.property("ADBE Vector Scale").value; } catch (e3) {}
    try { ro = T.property("ADBE Vector Rotation").value * Math.PI / 180; } catch (e4) {}
    var c = Math.cos(ro), s = Math.sin(ro), sx = sc[0] / 100, sy = sc[1] / 100;
    var M = [c * sx, s * sx, -s * sy, c * sy, 0, 0];
    M[4] = po[0] - (M[0] * an[0] + M[2] * an[1]); M[5] = po[1] - (M[1] * an[0] + M[3] * an[1]);
    return M;
}
function pt(M, p) { return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]; }
function vec(M, p) { return [M[0] * p[0] + M[2] * p[1], M[1] * p[0] + M[3] * p[1]]; }

// every path of a shape layer, with its index chain from the root (to find it again in a duplicate)
function walk(group, chain, M, out) {
    for (var i = 1; i <= group.numProperties; i++) {
        var it = group.property(i), mn = it.matchName, ch = chain.concat([i]);
        if (mn === "ADBE Vector Group") walk(it.property("ADBE Vectors Group"), ch.concat([2]), mMul(M, gMatrix(it)), out);
        else if (mn === "ADBE Vector Shape - Group") {
            var sh = it.property("ADBE Vector Shape").value, p = { ref: ch, v: [], i: [], o: [], c: sh.closed };
            for (var k = 0; k < sh.vertices.length; k++) { p.v.push(pt(M, sh.vertices[k])); p.i.push(vec(M, sh.inTangents[k])); p.o.push(vec(M, sh.outTangents[k])); }
            out.push(p);
        }
    }
}
function propAt(layer, chain) {
    var p = layer.property("ADBE Root Vectors Group");
    for (var i = 0; i < chain.length; i++) { if (!p) return null; p = p.property(chain[i]); }
    return p;
}
function chainKey(c) { return c.join("."); }
// keep only the listed paths in a duplicate of the outlines layer (empty groups go too)
function keepOnly(layer, keep) {
    var all = []; walk(layer.property("ADBE Root Vectors Group"), [], [1, 0, 0, 1, 0, 0], all);
    var k = {}; for (var i = 0; i < keep.length; i++) k[chainKey(keep[i])] = 1;
    var del = [];
    for (var j = 0; j < all.length; j++) if (!k[chainKey(all[j].ref)]) del.push(all[j].ref);
    // remove from the last index backwards so the earlier chains stay valid
    del.sort(function (a, b) { for (var q = 0; q < Math.max(a.length, b.length); q++) { var x = a[q] || 0, y = b[q] || 0; if (x !== y) return y - x; } return 0; });
    for (var d = 0; d < del.length; d++) { var pr = propAt(layer, del[d]); if (pr) pr.remove(); }
    prune(layer.property("ADBE Root Vectors Group"));
}
function hasPath(g) {
    for (var i = 1; i <= g.numProperties; i++) {
        var it = g.property(i);
        if (it.matchName === "ADBE Vector Shape - Group") return true;
        if (it.matchName === "ADBE Vector Group" && hasPath(it.property("ADBE Vectors Group"))) return true;
    }
    return false;
}
function prune(g) {
    for (var i = g.numProperties; i >= 1; i--) {
        var it = g.property(i);
        if (it.matchName === "ADBE Vector Group") { prune(it.property("ADBE Vectors Group")); if (!hasPath(it.property("ADBE Vectors Group"))) it.remove(); }
    }
}
function shapeOf(p) { var s = new Shape(); s.vertices = p.v; s.inTangents = p.i; s.outTangents = p.o; s.closed = p.c !== false; return s; }
function easeAll(prop) {
    for (var k = 1; k <= prop.numKeys; k++) {
        var dims = 1; try { var v = prop.keyValue(k); if (v instanceof Array) dims = v.length; } catch (e) {}
        var a = [], b = []; for (var d = 0; d < dims; d++) { a.push(new KeyframeEase(0, 60)); b.push(new KeyframeEase(0, 60)); }
        try { prop.setTemporalEaseAtKey(k, a, b); } catch (e2) {}
    }
}
function layerByComment(c) { for (var i = 1; i <= comp.numLayers; i++) if (String(comp.layer(i).comment) === c) return comp.layer(i); return null; }

// AE's own Create Shapes from Text: one group per character, the text layer stays as it is
function makeOutlines(L) {
    for (var a0 = 1; a0 <= comp.numLayers; a0++) comp.layer(a0).selected = false;
    var wasOn = L.enabled; L.selected = true;
    var cmd = 0; try { cmd = app.findMenuCommandId("Create Shapes from Text"); } catch (e0) {}
    app.executeCommand(cmd || 3781);
    var OL = null, sl = comp.selectedLayers;
    for (var b0 = 0; b0 < sl.length; b0++) if (sl[b0] !== L && sl[b0].property("ADBE Root Vectors Group")) OL = sl[b0];
    if (!OL && L.index > 1) { var up = comp.layer(L.index - 1); if (up.property("ADBE Root Vectors Group")) OL = up; }
    L.enabled = wasOn;
    if (!OL) throw new Error("Could not turn \"" + L.name + "\" into shapes.");
    OL.selected = false;
    return OL;
}
var phase = String(params.phase || "read");

// ------------------------------------------------------------------ read
if (phase === "read") {
    var src = [], seen = {};
    for (var s0 = 0; s0 < layers.length; s0++) {
        var c0 = layers[s0];
        // a Write-On layer selected: use its text
        var m2 = String(c0.comment).match(/^SQ Write (?:piece|mark) (\w+)/);
        if (m2) { var tx = layerByComment(TAG + " source " + m2[1]); if (tx) c0 = tx; }
        if (seen[c0.index]) continue;
        if (c0.property("ADBE Text Properties") && isArabicText(c0)) { src.push(c0); seen[c0.index] = 1; }
    }
    if (!src.length) throw new Error("Select an Arabic text layer.");
    src.sort(function (a, b) { return a.index - b.index; });
    var out = { t0: comp.time, fd: comp.frameDuration, layers: [] };
    for (var n = 0; n < src.length; n++) {
        var L = src[n], em = 100;
        try { em = L.property("ADBE Text Properties").property("ADBE Text Document").value.fontSize; } catch (ef) {}
        var OL = makeOutlines(L), paths = [];
        walk(OL.property("ADBE Root Vectors Group"), [], [1, 0, 0, 1, 0, 0], paths);
        OL.remove();                              // read leaves the comp as it was; build makes them again
        out.layers.push({ index: L.index, name: L.name, em: em, paths: paths });
    }
    for (var s1 = 0; s1 < src.length; s1++) src[s1].selected = true;
    return JSON.stringify(out);
}
if (phase === "abort") return "";

// ------------------------------------------------------------------ remove
if (phase === "remove") {
    var gone = 0, shown = 0, ids = {};
    for (var r0 = 0; r0 < layers.length; r0++) { var m0 = String(layers[r0].comment).match(/^SQ Write (?:piece|mark|source) (\w+)/); if (m0) ids[m0[1]] = 1; }
    var any = false; for (var kk in ids) any = true;
    for (var r1 = comp.numLayers; r1 >= 1; r1--) {
        var c1 = String(comp.layer(r1).comment), m1 = c1.match(/^SQ Write (piece|mark|source) (\w+)/);
        if (!m1 || (any && !ids[m1[2]])) continue;
        if (m1[1] === "source") { comp.layer(r1).enabled = true; comp.layer(r1).comment = ""; shown++; }
        else { comp.layer(r1).remove(); gone++; }
    }
    if (!gone && !shown) return "Select a Write-On layer (or nothing, to clear the whole comp).";
    return "Write-On removed" + (shown ? ", your text is back" : "") + ".";
}

// ------------------------------------------------------------------ build
var data = params.data; if (typeof data === "string") data = eval("(" + data + ")");
if (!data || !data.layers) throw new Error("Nothing to build.");
var made = 0, marks = 0, bounce = !!params.bounce, pop = Math.max(0.05, Number(params.pop) || 0.35);
for (var li = 0; li < data.layers.length; li++) {
    var D = data.layers[li], TXT = D.index <= comp.numLayers ? comp.layer(D.index) : null;
    if (!TXT || TXT.name !== D.name) throw new Error("The text layer changed. Select it and press Write again.");
    // running it again on the same text replaces the old Write-On
    var was = String(TXT.comment).match(/^SQ Write source (\w+)/);
    if (was) for (var w0 = comp.numLayers; w0 >= 1; w0--) { var cw = String(comp.layer(w0).comment); if (cw === TAG + " piece " + was[1] || cw === TAG + " mark " + was[1]) comp.layer(w0).remove(); }
    TXT.enabled = true;
    D.id = Math.floor(Math.random() * 1e9).toString(36);
    var OL2 = makeOutlines(TXT);
    var base = String(D.name).substring(0, 24), top = OL2, k2 = 0;
    // pieces: joined letters (or a single letter) written by their own Stroke
    for (var pi = 0; pi < D.pieces.length; pi++) {
        var P = D.pieces[pi], dup = OL2.duplicate();
        dup.enabled = true; dup.shy = false;
        keepOnly(dup, P.refs);
        dup.name = TAG + " \u00B7 " + base + " \u00B7 " + (++k2);
        dup.comment = TAG + " piece " + D.id;
        dup.label = 10;
        var MP = dup.property("ADBE Mask Parade");
        for (var mi = 0; mi < P.masks.length; mi++) {
            var mk = MP.addProperty("ADBE Mask Atom");
            mk.property("ADBE Mask Shape").setValue(shapeOf(P.masks[mi]));
            try { mk.maskMode = MaskMode.NONE; } catch (em) {}
            mk.name = "Write " + (mi + 1);
        }
        var fx = dup.property("ADBE Effect Parade").addProperty("ADBE Stroke");
        fx.name = "SQ Write";
        var S = function (m, v) { try { dup.property("ADBE Effect Parade").property("SQ Write").property(m).setValue(v); } catch (e) {} };
        S("ADBE Stroke-0010", 1);                     // All Masks
        S("ADBE Stroke-0011", 1);                     // Stroke Sequentially
        S("ADBE Stroke-0003", P.brush);               // Brush Size
        S("ADBE Stroke-0004", 95);                    // Brush Hardness (a hair soft, like a pen)
        S("ADBE Stroke-0006", 0);                     // Spacing 0: one continuous line, no dabs
        S("ADBE Stroke-0005", 100);                   // Opacity
        S("ADBE Stroke-0008", 0);                     // Start
        S("ADBE Stroke-0007", 3);                     // Paint Style: Reveal Original Image
        // when the write is done the brush grows so no corner of the letters stays hidden
        try { dup.property("ADBE Effect Parade").property("SQ Write").property("ADBE Stroke-0003").expression =
            "var e = effect(\"SQ Write\")(\"ADBE Stroke-0009\");\n(e.value >= 99.9) ? value * 4 : value"; } catch (ex) {}
        var end = dup.property("ADBE Effect Parade").property("SQ Write").property("ADBE Stroke-0009");
        end.setValueAtTime(P.t0, 0); end.setValueAtTime(P.t1, 100);
        // the pen skips the bits where it goes back over ink it already drew, so it never stalls
        if (P.remap && P.remap.length > 2) {
            var rows = []; for (var rr = 0; rr < P.remap.length; rr++) rows.push("[" + P.remap[rr][0] + "," + P.remap[rr][1] + "]");
            try { end.expression = "// Squeezy Write-On: keyframe End 0 to 100 as usual\nvar T = [" + rows.join(",") + "];\n" +
                "var p = Math.max(0, Math.min(1, value / 100)), i = 0;\n" +
                "for (var k = T.length - 2; k >= 0; k--) if (p >= T[k][0]) { i = k; break; }\n" +
                "var a = T[i], b = T[i + 1], u = b[0] > a[0] ? (p - a[0]) / (b[0] - a[0]) : 1;\n" +
                "(a[1] + (b[1] - a[1]) * u) * 100"; } catch (ee) {}
        }
        try { end.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); end.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (el) {}
        dup.moveBefore(top); top = dup; made++;
    }
    // marks: dots, hamza, shadda, harakat. Each pops from its own centre when the stroke reaches it
    for (var mj = 0; mj < D.marks.length; mj++) {
        var Mk = D.marks[mj], dm = OL2.duplicate();
        dm.enabled = true;
        keepOnly(dm, Mk.refs);
        dm.name = TAG + " \u00B7 " + base + " \u00B7 dot " + (mj + 1);
        dm.comment = TAG + " mark " + D.id;
        dm.label = 11;
        var T = wtr(dm), ap = T.property("ADBE Anchor Point").value, po = T.property("ADBE Position").value;
        var sc = T.property("ADBE Scale").value, ro = 0; try { ro = T.property("ADBE Rotate Z").value * Math.PI / 180; } catch (er) {}
        var dx = (Mk.cx - ap[0]) * sc[0] / 100, dy = (Mk.cy - ap[1]) * sc[1] / 100;
        var nx = po[0] + dx * Math.cos(ro) - dy * Math.sin(ro), ny = po[1] + dx * Math.sin(ro) + dy * Math.cos(ro);
        T.property("ADBE Anchor Point").setValue(ap.length > 2 ? [Mk.cx, Mk.cy, ap[2]] : [Mk.cx, Mk.cy]);
        T.property("ADBE Position").setValue(po.length > 2 ? [nx, ny, po[2]] : [nx, ny]);
        var SP = T.property("ADBE Scale"), s0 = sc.length > 2 ? [0, 0, sc[2]] : [0, 0];
        var full = sc.slice(0), over = [sc[0] * 1.15, sc[1] * 1.15]; if (sc.length > 2) over.push(sc[2]);
        SP.setValueAtTime(Mk.t, s0);
        if (bounce) { SP.setValueAtTime(Mk.t + pop * 0.6, over); SP.setValueAtTime(Mk.t + pop, full); }
        else SP.setValueAtTime(Mk.t + pop, full);
        easeAll(SP);
        dm.moveBefore(top); top = dm; marks++;
    }
    OL2.remove();
    TXT.enabled = false; TXT.comment = TAG + " source " + D.id;
}
return "Write-On ready: " + made + " piece" + (made === 1 ? "" : "s") + " and " + marks + " dot" + (marks === 1 ? "" : "s") +
    ". Move the \"End\" keys of SQ Write (and the dots' Scale keys) to change the speed.";
