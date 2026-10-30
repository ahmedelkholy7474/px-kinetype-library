if (!comp) return "Open a composition first.";
var ls = [];
for (var i = 0; i < layers.length; i++) if (layers[i].property("ADBE Effect Parade") && String(layers[i].name).indexOf("SQ Scan ") !== 0) ls.push(layers[i]);
if (ls.length < 2) return "Select 2 or more image layers, in the order you want them.";
var t0 = comp.time, hold = params.hold, tr = params.transition, step = params.step;
// stack: later images above earlier ones
for (var a = 1; a < ls.length; a++) ls[a].moveBefore(ls[a - 1]);
for (var j = 0; j < ls.length; j++) {
    var l = ls[j], tin = t0 + j * hold, tout = t0 + (j + 1) * hold + tr;
    l.startTime += tin - l.inPoint;
    if (j < ls.length - 1) { try { l.outPoint = Math.max(tin + 0.1, tout); } catch (e) {} }
    if (j > 0) {
        sqScan(comp, l, { t0: tin, dur: tr, size: params.size, dir: "random", random: 100, band: 22, color: "#FFFFFF", glow: params.glow });
        // previous card steps down in scale while it gets covered
        var prev = ls[j - 1], sc = prev.property("ADBE Transform Group").property("ADBE Scale");
        var base = sc.valueAtTime(tin, false), steps = 3;
        for (var s = 0; s <= steps; s++) {
            var f = 1 - (step / 100) * (s / steps), v = [];
            for (var d = 0; d < base.length; d++) v.push(d < 2 ? base[d] * f : base[d]);
            var kt = tin + tr * (s / steps);
            sc.setValueAtTime(kt, v);
            var ki = sc.nearestKeyIndex(kt);
            try { sc.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD); } catch (e2) {}
        }
    }
}
return "Block Flow: " + ls.length + " images, " + (ls.length - 1) + " block transitions";
