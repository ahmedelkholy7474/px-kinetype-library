// Squeezy add-on: Kashida Stretch v4
// Arabic text: the kashida (tatweel, U+0640) stretches the word: خولي -> خــــولي
// One clean set of controls on the layer (all keyframable):
//   Stretch amount    how long the kashida gets (number of kashida)
//   Pivot             where in the word it stretches (0% = first joint, 100% = last joint)
//   Stretch direction which way the word grows (Left / Right), the other side stays put
//   Bilateral push    grow both ways from the centre
// runs as function(params, comp, layers)
if (!comp) return "Open a composition first.";
if (params.action === "Remove") {
    var rm = 0;
    for (var r = 0; r < layers.length; r++) {
        var L0 = layers[r];
        if (!L0.property("ADBE Text Properties")) continue;
        var td0 = L0.property("ADBE Text Properties").property("ADBE Text Document");
        if (String(td0.expression).indexOf("SQ-KASHIDA") < 0 && !sqFx(L0).property("Stretch amount")) continue;
        td0.expression = "";
        var ap0 = L0.property("ADBE Transform Group").property("ADBE Anchor Point");
        if (String(ap0.expression).indexOf("SQ-KASHIDA") >= 0) ap0.expression = "";
        var fx0 = sqFx(L0);
        var names = ["Stretch amount", "Pivot", "Stretch direction", "Bilateral push"];
        for (var nn = 0; nn < names.length; nn++) { try { if (fx0.property(names[nn])) fx0.property(names[nn]).remove(); } catch (e0) {} }
        sqRemoveFx(L0, "SQ Kashida");     // older versions
        rm++;
    }
    return rm ? "Kashida removed from " + rm + " layer" + (rm > 1 ? "s" : "") : "Select a layer that has Kashida Stretch.";
}

var MODES = { "Each word": 0, "Longest word only": 2, "Every joint": 3 };
var mode = MODES[params.words]; if (mode === undefined) mode = 0;
var n = 0, skipped = 0;

// ---- sourceText: insert the kashida at the pivot joint(s) ----
var expr = [
 "// SQ-KASHIDA",
 "var N = Math.max(0, Math.round(effect(\"Stretch amount\")(1))), PV = Math.min(Math.max(effect(\"Pivot\")(1), 0), 100) / 100;",
 "var s = '' + value, MODE = " + mode + ";",
 "function ar(c){ var x = c.charCodeAt(0); return (x >= 0x0620 && x <= 0x064A) || (x >= 0x066E && x <= 0x06D3); }",
 "function joins(c){ return ar(c) && 'اأإآٱدذرزوؤةءژ'.indexOf(c) < 0; }",
 "var words = [], st = -1;",
 "for (var i = 0; i <= s.length; i++) { var ch = i < s.length ? s.charAt(i) : ' '; if (ar(ch) || ch == '\\u0640') { if (st < 0) st = i; } else if (st >= 0) { words.push([st, i]); st = -1; } }",
 "function cand(w){ var r = []; for (var j = w[0]; j < w[1] - 1; j++) { if (joins(s.charAt(j)) && ar(s.charAt(j + 1))) r.push(j + 1); } return r; }",
 "if (MODE == 2) { var best = null; for (var w = 0; w < words.length; w++) if (!best || words[w][1] - words[w][0] > best[1] - best[0]) best = words[w]; if (best) words = [best]; }",
 "var spots = [];",
 "for (var w2 = 0; w2 < words.length; w2++) { var c = cand(words[w2]); if (!c.length) continue;",
 "  if (MODE == 3) spots = spots.concat(c); else spots.push(c[Math.round(PV * (c.length - 1))]); }",
 "var run = ''; for (var q = 0; q < N; q++) run += '\\u0640';",
 "spots.sort(function (a, b) { return a - b; });",
 "var out = '', last = 0; for (var z = 0; z < spots.length; z++) { out += s.substring(last, spots[z]) + run; last = spots[z]; }",
 "out += s.substring(last); out;"
].join("\n");

// ---- anchor point: keep one side (or the centre) still while the word grows ----
// rest size = the text at a moment when Stretch amount is 0 (its first such keyframe), else now
var anchorExpr = [
 "// SQ-KASHIDA",
 "var A = effect(\"Stretch amount\")(1), tr = null;",
 "if (A.numKeys > 0) { for (var k = 1; k <= A.numKeys; k++) if (A.key(k).value <= 0.5) { tr = A.key(k).time; break; } }",
 "else if (A.value <= 0.5) tr = time;",
 "if (tr === null) { value; } else {",
 "  var r = sourceRectAtTime(time, false), r0 = sourceRectAtTime(tr, false);",
 "  var bil = effect(\"Bilateral push\")(1) > 0.5, dir = Math.round(effect(\"Stretch direction\")(1));",
 "  var dx = bil ? (r.left + r.width / 2) - (r0.left + r0.width / 2)",
 "         : (dir == 1 ? (r.left + r.width) - (r0.left + r0.width) : r.left - r0.left);",
 "  value.length > 2 ? [value[0] + dx, value[1], value[2]] : [value[0] + dx, value[1]];",
 "}"
].join("\n");

function dropdown(l, name, items, v) {
    var p = sqFx(l).property(name);
    if (p && p.matchName !== "ADBE Dropdown Control") { p.remove(); p = null; }
    if (!p) {
        p = sqFx(l).addProperty("ADBE Dropdown Control");
        p.name = name;
        try { sqFx(l).property(name).property(1).setPropertyParameters(items); } catch (e) {}
    }
    try { sqFx(l).property(name).property(1).setValue(v); } catch (e2) {}
    return sqFx(l).property(name);
}

var t0 = comp.time;
for (var i = 0; i < layers.length; i++) {
    var l = layers[i];
    if (!l.property("ADBE Text Properties")) { skipped++; continue; }
    var txt = String(l.property("ADBE Text Properties").property("ADBE Text Document").value.text);
    if (!/[ؠ-ي]/.test(txt)) { skipped++; continue; }
    sqRemoveFx(l, "SQ Kashida");            // v1-v3 controls
    sqSlider(l, "Stretch amount", 0);
    sqSlider(l, "Pivot", params.pivot);
    var dd = null;
    try { dd = dropdown(l, "Stretch direction", ["Left", "Right"], params.direction === "Right" ? 2 : 1); } catch (ed) { dd = null; }
    if (!dd) sqSlider(l, "Stretch direction", params.direction === "Right" ? 2 : 1);   // very old AE: 1 = Left, 2 = Right
    sqCheckbox(l, "Bilateral push", params.bilateral);

    var am = sqFx(l).property("Stretch amount").property(1);
    while (am.numKeys) am.removeKey(1);
    var N = Math.max(1, Math.round(params.amount || 6));
    if (params.animate) {
        // stretch in with a little overshoot, settle, (optionally) fold back before the layer ends
        var D = Math.max(0.1, params.duration || 0.6), B = (params.bounce || 0) / 100;
        am.setValueAtTime(t0, 0);
        if (B > 0.01) { am.setValueAtTime(t0 + D * 0.62, N * (1 + B * 0.6)); }
        am.setValueAtTime(t0 + D, N);
        if (params.collapse) {
            var te = Math.max(t0 + D + 0.2, l.outPoint - D * 0.8);
            am.setValueAtTime(te, N);
            am.setValueAtTime(Math.min(te + D * 0.8, l.outPoint), 0);
        }
        sqEaseKeys(am);
    } else {
        am.setValue(N);
    }
    l.property("ADBE Text Properties").property("ADBE Text Document").expression = expr;
    l.property("ADBE Transform Group").property("ADBE Anchor Point").expression = anchorExpr;
    n++;
}
if (!n) return "Select an Arabic text layer.";
return "Kashida Stretch on " + n + " layer" + (n > 1 ? "s" : "") + ". Tweak or keyframe \"Stretch amount\", \"Pivot\", direction and \"Bilateral push\" in Effect Controls." + (skipped ? " (" + skipped + " skipped, not Arabic text)" : "");
