// ---- Squeezy add-on helpers (ExtendScript, ES3) ----
function sqFx(l) { return l.property("ADBE Effect Parade"); }
function sqCtrl(l, match, name, v) {
    var p = sqFx(l).property(name);
    if (p && p.matchName !== match) { p.remove(); p = null; }
    if (!p) { p = sqFx(l).addProperty(match); p.name = name; p = sqFx(l).property(name); }
    try { if (v !== undefined && v !== null) p.property(1).setValue(v); } catch (e) {}
    return sqFx(l).property(name);
}
function sqSlider(l, name, v) { return sqCtrl(l, "ADBE Slider Control", name, v); }
function sqCheckbox(l, name, v) { return sqCtrl(l, "ADBE Checkbox Control", name, v ? 1 : 0); }
function sqHex(h) { var n = parseInt(String(h).replace("#", ""), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; }
function sqRemoveFx(l, prefix) {
    var fx = sqFx(l); if (!fx) return;
    for (var i = fx.numProperties; i >= 1; i--) if (String(fx.property(i).name).indexOf(prefix) === 0) fx.property(i).remove();
}
function sqRemoveKids(comp, l, prefix) {
    for (var i = comp.numLayers; i >= 1; i--) {
        var c = comp.layer(i);
        if (c.parent && c.parent.index === l.index && String(c.name).indexOf(prefix) === 0) c.remove();
    }
}
function sqEaseKeys(prop) {
    for (var k = 1; k <= prop.numKeys; k++) {
        var dims = 1; try { var v = prop.keyValue(k); if (v instanceof Array) dims = v.length; } catch (e) {}
        if (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL) dims = 1;
        var a = [], b = [];
        for (var d = 0; d < dims; d++) { a.push(new KeyframeEase(0, 45)); b.push(new KeyframeEase(0, 45)); }
        try { prop.setTemporalEaseAtKey(k, a, b); } catch (e2) {}
    }
}

// ---- pixel grid reveal (used by Pixel Scan Reveal and Block Flow) ----
// Builds a block matte + optional glowing block layer, both parented to the target layer.
function sqScan(comp, l, o) {
    var r = l.sourceRectAtTime(o.t0, false);
    if (!r || r.width < 1 || r.height < 1) throw new Error(l.name + " has nothing visible at the current time");
    var size = Math.max(4, o.size), cols, rows;
    do { cols = Math.ceil(r.width / size); rows = Math.ceil(r.height / size); if (cols * rows > 700) size *= 1.15; } while (cols * rows > 700);

    sqRemoveKids(comp, l, "SQ Scan ");
    sqRemoveFx(l, "SQ Scan ");
    sqSlider(l, "SQ Scan Progress", 0);
    sqSlider(l, "SQ Scan Random", o.random);
    sqSlider(l, "SQ Scan Glow Band", o.band);
    var pr = sqFx(l).property("SQ Scan Progress").property(1);
    pr.setValueAtTime(o.t0, 0);
    pr.setValueAtTime(o.t0 + o.dur, 100);
    sqEaseKeys(pr);

    var cells = [];
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var cx = r.left + (x + 0.5) * size, cy = r.top + (y + 0.5) * size, u;
        var nx = cols > 1 ? x / (cols - 1) : 0, ny = rows > 1 ? y / (rows - 1) : 0;
        switch (o.dir) {
            case "rtl": u = 1 - nx; break;
            case "ttb": u = ny; break;
            case "btt": u = 1 - ny; break;
            case "center": u = Math.min(1, Math.sqrt((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5)) / 0.7072); break;
            case "random": u = Math.random(); break;
            default: u = nx;
        }
        cells.push({ x: cx, y: cy, u: u, q: Math.random() });
    }

    function grid(name, glow) {
        var s = comp.layers.addShape();
        s.name = name;
        s.moveBefore(l);
        s.parent = l;
        try { s.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]); } catch (e) {}
        try { s.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]); } catch (e1) { try { s.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0, 0]); } catch (e2) {} }
        var root = function () { return s.property("ADBE Root Vectors Group"); };
        var bs = glow ? size * 0.78 : size + 1;
        var col = glow ? sqHex(o.color) : [1, 1, 1, 1];
        for (var i = 0; i < cells.length; i++) {
            var c = cells[i], k = (c.u * 1).toFixed(4), qq = c.q.toFixed(4);
            var gi = root().addProperty("ADBE Vector Group").propertyIndex;
            var G = function () { return root().property(gi); };
            G().property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
            G().property("ADBE Vectors Group").property(1).property("ADBE Vector Rect Size").setValue([bs, bs]);
            G().property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
            G().property("ADBE Vectors Group").property(2).property("ADBE Vector Fill Color").setValue(col);
            var T = G().property("ADBE Vector Transform Group");
            T.property("ADBE Vector Position").setValue([c.x, c.y]);
            var head = "var P=parent.effect(\"SQ Scan Progress\")(1)/100, R=parent.effect(\"SQ Scan Random\")(1)/100; var k=" + k + "*(1-R)+" + qq + "*R*0.999;";
            G().property("ADBE Vector Transform Group").property("ADBE Vector Group Opacity").expression = glow
                ? head + " var B=Math.max(parent.effect(\"SQ Scan Glow Band\")(1)/100,0.001), d=P-k*(1-B)-B*0.5; (P>0 && P<1 && d>=-B*0.5 && d<B*0.5) ? 100*(1-Math.abs(d)/(B*0.5)) : 0;"
                : head + " (P>=1 || (P>0 && P>=k)) ? 100 : 0;";
        }
        return s;
    }

    var m = grid("SQ Scan Matte · " + l.name, false);
    if (o.glow) {
        var g = grid("SQ Scan Glow · " + l.name, true);
        g.blendingMode = BlendingMode.ADD;
        var gl = sqFx(g).addProperty("ADBE Glo2");
        try { gl.property(3).setValue(Math.max(10, size * 0.8)); gl.property(4).setValue(1.6); } catch (eg) {}
    }
    var done = false;
    try { if (l.setTrackMatte) { l.setTrackMatte(m, TrackMatteType.ALPHA); done = true; } } catch (et) {}
    if (!done) { m.moveBefore(l); l.trackMatteType = TrackMatteType.ALPHA; }
    m.enabled = false;
    return cells.length;
}
