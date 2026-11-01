// Squeezy Glass rig (delivered by Sync). Runs as function(params, comp, layers).
// params.action: "apply" (params.values = the controls) or "remove".
function gfx(l) { return l.property("ADBE Effect Parade"); }
function gexpr(prop, expr) { if (!prop || !expr) return; try { prop.expression = expr; } catch (e) {} }
function gstep(x) {}
function gstarts(s, p) { return String(s).indexOf(p) === 0; }

var GLASS_CTRL = [
    ["SQ Glass Refraction", 70], ["SQ Glass Bevel", 40], ["SQ Glass Dispersion", 15], ["SQ Glass Frost", 0],
    ["SQ Glass Tint Amount", 12], ["SQ Glass Highlight", 70], ["SQ Glass Rim", 85], ["SQ Glass Rim Width", 1.6],
    ["SQ Glass Light Angle", 135], ["SQ Glass Inner Shadow", 35], ["SQ Glass Darken", 0], ["SQ Glass Grain", 0],
    ["SQ Glass Shadow", 35]
];
var GLASS_TINT = "SQ Glass Tint";
function sqFolder(name) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        var isF = false;
        try { isF = (it instanceof FolderItem) || (typeof it.numItems === "number" && typeof it.numLayers !== "number"); } catch (e) {}
        if (isF && it.name === name) return it;
    }
    return app.project.items.addFolder(name);
}
function q2(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function fxAdd(l, match, name) {
    var e = gfx(l).addProperty(match);
    if (name) { e.name = name; return gfx(l).property(name); }
    return e;
}

// Liquid glass rig (matches the panel preview):
//  body      adjustment layer, matted by the shape: edge-only refraction (normal maps from a
//            blurred copy of the shape, flat = no bend in the centre), optional frost/darken/grain
//  tint      milky colour over the body
//  shade     emboss of the bevel in Overlay: curvature light
//  inner     soft inner shadow on the side away from the light (Multiply)
//  glow      wide soft band inside the edge, lit on both sides (Screen)
//  rim       crisp specular edge, strong toward the light, softer opposite (Screen)
//  shadow    soft drop shadow under the glass
// visual centre of a layer in comp space (rotation / scale / anchor aware, no parent)
function glassCenter(L, t) {
    var r = { left: 0, top: 0, width: 0, height: 0 };
    try { r = L.sourceRectAtTime(t, false); } catch (e) {}
    var tr = L.property("ADBE Transform Group");
    var a = tr.property("ADBE Anchor Point").valueAtTime(t, false), p = tr.property("ADBE Position").valueAtTime(t, false);
    var sc = tr.property("ADBE Scale").valueAtTime(t, false), rot = 0;
    try { rot = tr.property("ADBE Rotate Z").valueAtTime(t, false) * Math.PI / 180; } catch (e2) {}
    var x = (r.left + r.width / 2 - a[0]) * sc[0] / 100, y = (r.top + r.height / 2 - a[1]) * sc[1] / 100;
    if (L.parent) return [p[0], p[1]];
    return [p[0] + x * Math.cos(rot) - y * Math.sin(rot), p[1] + x * Math.sin(rot) + y * Math.cos(rot)];
}

function glassOne(comp, S, o, folder) {
    var base = String(S.name).replace(/^SQ Glass Shape \u00B7 /, "");
    var tin = S.inPoint, tout = S.outPoint;
    var ctr = glassCenter(S, comp.time);
    gstep("precompose " + base);
    var shapeComp = comp.layers.precompose([S.index], "SQ Glass Shape \u00B7 " + base, true);
    shapeComp.parentFolder = folder;
    var P = null;
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).source && comp.layer(i).source.id === shapeComp.id) { P = comp.layer(i); break; }
    P.name = "SQ Glass Shape \u00B7 " + base;
    var glassName = "SQ Glass \u00B7 " + base, ctlName = "SQ Glass Controller \u00B7 " + base;
    var CTL = function (n) { return 'comp("' + q2(comp.name) + '").layer("' + q2(ctlName) + '").effect("' + n + '")(1)'; };
    var ANG = CTL("SQ Glass Light Angle") + "*Math.PI/180";
    var LX = "Math.cos(" + ANG + ")", LY = "(-Math.sin(" + ANG + "))";        // 135 deg = light from top-left
    // ONE controller: its transform moves / scales / rotates / fades the glass, its effects are the look
    var C = comp.layers.addNull();
    C.name = ctlName;
    C.label = 9;
    try { C.property("ADBE Transform Group").property("ADBE Position").setValue([ctr[0], ctr[1]]); } catch (ep) { C.property("ADBE Transform Group").property("ADBE Position").setValue([ctr[0], ctr[1], 0]); }
    C.comment = "Squeezy Glass: move / scale / rotate / fade this layer. Look = Effect Controls. Edit the shape inside \"SQ Glass Shape \u00B7 " + base + "\".";
    for (var k = 0; k < GLASS_CTRL.length; k++) {
        var key = GLASS_CTRL[k][0], val = o[key] !== undefined ? o[key] : GLASS_CTRL[k][1];
        var sl = gfx(C).addProperty("ADBE Slider Control"); sl.name = key;
        try { gfx(C).property(key).property(1).setValue(val); } catch (e6) {}
    }
    var tc = gfx(C).addProperty("ADBE Color Control"); tc.name = GLASS_TINT;
    try { gfx(C).property(GLASS_TINT).property(1).setValue(o[GLASS_TINT] || [0.96, 0.94, 1, 1]); } catch (e6b) {}
    var CL = 'thisComp.layer("' + q2(ctlName) + '")';

    function newComp(name) {
        var c = app.project.items.addComp(name, comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameRate);
        c.parentFolder = folder;
        return c;
    }
    function shapeIn(c, color) {
        var L = c.layers.add(shapeComp);
        L.startTime = 0;
        var f = fxAdd(L, "ADBE Fill");
        try { f.property(3).setValue(color); } catch (e) {}
        return L;
    }
    // normal map along one axis: emboss of a blurred copy (50% grey = flat = no bend)
    function embossComp(name, dirExpr, contrastExpr) {
        var c = newComp(name);
        c.layers.addSolid([0, 0, 0], "black", c.width, c.height, c.pixelAspect, c.duration);
        var L = shapeIn(c, [1, 1, 1, 1]);
        var bl = fxAdd(L, "ADBE Box Blur2");
        gexpr(bl.property(1), "Math.max(" + CTL("SQ Glass Bevel") + "*0.5, 1)");
        try { gfx(L).property(2).property(2).setValue(3); } catch (e) {}
        var adj = c.layers.addSolid([1, 1, 1], "emboss", c.width, c.height, c.pixelAspect, c.duration);
        adj.adjustmentLayer = true;
        fxAdd(adj, "ADBE Emboss");
        gexpr(gfx(adj).property(1).property(1), dirExpr);
        try { gfx(adj).property(1).property(2).setValue(4); } catch (e2) {}
        gexpr(gfx(adj).property(1).property(3), contrastExpr);
        try { gfx(adj).property(1).property(4).setValue(0); } catch (e3) {}
        return c;
    }
    // band just inside the edge, shaded by two ramps: bright toward the light, softer opposite
    function bandComp(name, widthExpr, blurExpr, oppositeShare) {
        var c = newComp(name);
        var M = shapeIn(c, [1, 1, 1, 1]);
        M.name = "inner";
        var ch = fxAdd(M, "ADBE Simple Choker");
        gexpr(gfx(M).property(2).property(2), widthExpr);
        if (blurExpr) { var mb = fxAdd(M, "ADBE Gaussian Blur 2"); gexpr(mb.property(1), blurExpr); }   // soft inner edge for the glow
        var lit = [["toward light", "", 100], ["opposite", "-", oppositeShare]];
        var made = [];
        for (var r = 0; r < lit.length; r++) {
            var R = shapeIn(c, [1, 1, 1, 1]);
            R.name = lit[r][0];
            var rp = fxAdd(R, "ADBE Ramp");
            var sg = lit[r][1];
            gexpr(rp.property(1), "[thisComp.width/2 " + sg + "+ " + LX + "*thisComp.width/2, thisComp.height/2 " + sg + "+ " + LY + "*thisComp.height/2]");
            try { gfx(R).property(2).property(2).setValue([1, 1, 1, 1]); } catch (e1) {}
            gexpr(gfx(R).property(2).property(3), "[thisComp.width/2 " + (sg ? "+" : "-") + " " + LX + "*thisComp.width/2, thisComp.height/2 " + (sg ? "+" : "-") + " " + LY + "*thisComp.height/2]");
            try { gfx(R).property(2).property(4).setValue([0, 0, 0, 1]); } catch (e2) {}
            if (blurExpr) { var gb = fxAdd(R, "ADBE Gaussian Blur 2"); gexpr(gb.property(1), blurExpr); }
            R.property("ADBE Transform Group").property("ADBE Opacity").setValue(lit[r][2]);
            if (r > 0) R.blendingMode = BlendingMode.SCREEN;
            R.setTrackMatte(M, TrackMatteType.ALPHA_INVERTED);
            made.push(R);
        }
        M.moveToBeginning();
        M.enabled = false;
        return c;
    }

    // dispersion: thin coloured fringe inside the edge (cyan toward the light, warm on the far side)
    function chromaComp(name) {
        var c = newComp(name);
        var M = shapeIn(c, [1, 1, 1, 1]); M.name = "inner";
        fxAdd(M, "ADBE Simple Choker");
        gexpr(gfx(M).property(2).property(2), "Math.max(" + CTL("SQ Glass Bevel") + "*0.3, 1)");
        var mb = fxAdd(M, "ADBE Gaussian Blur 2"); gexpr(mb.property(1), "Math.max(" + CTL("SQ Glass Bevel") + "*0.15, 1)");
        var R = shapeIn(c, [1, 1, 1, 1]); R.name = "fringe";
        var rp = fxAdd(R, "ADBE Ramp");
        gexpr(rp.property(1), "[thisComp.width/2 + " + LX + "*thisComp.width/2, thisComp.height/2 + " + LY + "*thisComp.height/2]");
        try { gfx(R).property(2).property(2).setValue([0.35, 0.9, 1, 1]); } catch (e1) {}
        gexpr(gfx(R).property(2).property(3), "[thisComp.width/2 - " + LX + "*thisComp.width/2, thisComp.height/2 - " + LY + "*thisComp.height/2]");
        try { gfx(R).property(2).property(4).setValue([1, 0.35, 0.55, 1]); } catch (e2) {}
        var gb = fxAdd(R, "ADBE Gaussian Blur 2"); gexpr(gb.property(1), "Math.max(" + CTL("SQ Glass Bevel") + "*0.08, 0.5)");
        R.setTrackMatte(M, TrackMatteType.ALPHA_INVERTED);
        M.moveToBeginning(); M.enabled = false;
        return c;
    }

    gstep("maps " + base);
    var mx = embossComp("SQ Glass Map X \u00B7 " + base, "0", "250");
    var my = embossComp("SQ Glass Map Y \u00B7 " + base, "90", "250");
    var ms = embossComp("SQ Glass Shade \u00B7 " + base, CTL("SQ Glass Light Angle"), CTL("SQ Glass Highlight") + "*1.6");
    gstep("rim " + base);
    var rc = bandComp("SQ Glass Rim \u00B7 " + base, "Math.max(" + CTL("SQ Glass Rim Width") + ", 0.2)", "", 55);
    var cc = chromaComp("SQ Glass Chroma \u00B7 " + base);
    var gc = bandComp("SQ Glass Glow \u00B7 " + base, "Math.max(" + CTL("SQ Glass Bevel") + "*0.55, 1)", "Math.max(" + CTL("SQ Glass Bevel") + "*0.35, 1)", 45);
    // inner shadow: dark rim map (white shape on black, blurred) shifted toward the light
    var ic = newComp("SQ Glass Inner \u00B7 " + base);
    ic.layers.addSolid([0, 0, 0], "black", ic.width, ic.height, ic.pixelAspect, ic.duration);
    var IS = shapeIn(ic, [1, 1, 1, 1]);
    var ib = fxAdd(IS, "ADBE Gaussian Blur 2");
    gexpr(ib.property(1), "Math.max(" + CTL("SQ Glass Bevel") + "*0.6, 1)");
    try { gfx(IS).property(2).property(3).setValue(1); } catch (e0) {}
    gexpr(IS.property("ADBE Transform Group").property("ADBE Position"),
        "value + [" + LX + ", " + LY + "]*" + CTL("SQ Glass Bevel") + "*0.35");

    // ---- main comp ----
    gstep("glass layer " + base);
    var A = comp.layers.addSolid([1, 1, 1], glassName, comp.width, comp.height, comp.pixelAspect, comp.duration);
    A.adjustmentLayer = true;
    A.moveBefore(P);
    A.label = 11;

    var MX = comp.layers.add(mx), MY = comp.layers.add(my);
    MX.name = mx.name; MY.name = my.name;
    MX.moveAfter(P); MY.moveAfter(MX);
    MX.enabled = false; MY.enabled = false;
    function displace(name, layer, horiz) {
        var d = fxAdd(A, "ADBE Displacement Map", name);
        d.property(1).setValue(layer.index);
        d = gfx(A).property(name);
        try { d.property(2).setValue(5); d.property(4).setValue(5); } catch (e7) {}
        gexpr(d.property(3), horiz ? "-" + CL + '.effect("SQ Glass Refraction")(1)' : "0");
        gexpr(gfx(A).property(name).property(5), horiz ? "0" : "-" + CL + '.effect("SQ Glass Refraction")(1)');
        try { gfx(A).property(name).property(6).setValue(1); } catch (e8) {}
        try { gfx(A).property(name).property(8).setValue(1); } catch (e9) {}
    }
    displace("SQ Glass Refract X", MX, true);
    displace("SQ Glass Refract Y", MY, false);
    fxAdd(A, "ADBE Gaussian Blur 2", "SQ Glass Frost Blur");
    gexpr(gfx(A).property("SQ Glass Frost Blur").property(1), CL + '.effect("SQ Glass Frost")(1)');
    try { gfx(A).property("SQ Glass Frost Blur").property(3).setValue(1); } catch (e10) {}
    fxAdd(A, "ADBE Brightness & Contrast 2", "SQ Glass Tone");
    gexpr(gfx(A).property("SQ Glass Tone").property(1), "-" + CL + '.effect("SQ Glass Darken")(1)');
    fxAdd(A, "ADBE Noise", "SQ Glass Grain FX");
    gexpr(gfx(A).property("SQ Glass Grain FX").property(1), CL + '.effect("SQ Glass Grain")(1)/12');
    try { gfx(A).property("SQ Glass Grain FX").property(2).setValue(0); } catch (e11) {}
    A.setTrackMatte(P, TrackMatteType.ALPHA);

    var GL = CL;
    function overlay(srcComp, blend, opacityExpr) {
        var L = comp.layers.add(srcComp); L.name = srcComp.name;
        L.blendingMode = blend;
        gexpr(L.property("ADBE Transform Group").property("ADBE Opacity"), opacityExpr);
        L.setTrackMatte(P, TrackMatteType.ALPHA);
        return L;
    }
    // tint (solid in the tint colour)
    var TI = comp.layers.addSolid([1, 1, 1], "SQ Glass Tint \u00B7 " + base, comp.width, comp.height, comp.pixelAspect, comp.duration);
    var tf = fxAdd(TI, "ADBE Fill");
    gexpr(tf.property(3), GL + '.effect("' + GLASS_TINT + '")(1)');
    gexpr(TI.property("ADBE Transform Group").property("ADBE Opacity"), GL + '.effect("SQ Glass Tint Amount")(1)');
    TI.setTrackMatte(P, TrackMatteType.ALPHA);
    TI.moveBefore(A);
    var SHD = overlay(ms, BlendingMode.OVERLAY, "clamp(" + GL + '.effect("SQ Glass Highlight")(1), 0, 100)'); SHD.moveBefore(TI);
    var INN = overlay(ic, BlendingMode.MULTIPLY, GL + '.effect("SQ Glass Inner Shadow")(1)'); INN.moveBefore(SHD);
    var GLO = overlay(gc, BlendingMode.SCREEN, GL + '.effect("SQ Glass Highlight")(1)*0.8'); GLO.moveBefore(INN);
    var RM = overlay(rc, BlendingMode.SCREEN, GL + '.effect("SQ Glass Rim")(1)'); RM.moveBefore(GLO);
    var CH = overlay(cc, BlendingMode.SCREEN, GL + '.effect("SQ Glass Dispersion")(1)*0.7'); CH.moveBefore(RM);

    // soft drop shadow under the glass (the glass refracts it too)
    var SH = comp.layers.add(shapeComp); SH.name = "SQ Glass Shadow \u00B7 " + base; SH.moveAfter(A);
    var sf = fxAdd(SH, "ADBE Fill"); try { sf.property(3).setValue([0, 0, 0, 1]); } catch (e12) {}
    fxAdd(SH, "ADBE Gaussian Blur 2", "SQ Shadow Blur");
    var SC = GL + '.effect("SQ Glass Shadow")(1)';
    gexpr(gfx(SH).property("SQ Shadow Blur").property(1), "8 + " + SC + "*0.6");
    gexpr(SH.property("ADBE Transform Group").property("ADBE Opacity"), SC + "*0.55");
    gexpr(SH.property("ADBE Transform Group").property("ADBE Position"), "value + [0, " + SC + "*0.35]");

    P.enabled = false;
    var all = [A, TI, SHD, INN, GLO, RM, CH, SH, P, MX, MY, C];
    for (var z = 0; z < all.length; z++) { try { all[z].inPoint = tin; all[z].outPoint = tout; } catch (e13) {} }
    P.comment = "Squeezy Glass: double-click to edit the shape. Move it with " + ctlName;

    // the shape follows the controller (everything else is built from the shape, so it all follows)
    var CTW = 'comp("' + q2(comp.name) + '").layer("' + q2(ctlName) + '")';
    var PV = shapeComp.layers.addNull();
    PV.name = "SQ Glass Pivot";
    PV.property("ADBE Transform Group").property("ADBE Position").setValue([ctr[0], ctr[1]]);
    PV.enabled = false;
    for (var q = 1; q <= shapeComp.numLayers; q++) {
        var ch = shapeComp.layer(q);
        if (ch.index === PV.index || ch.parent) continue;
        ch.parent = PV;
        gexpr(ch.property("ADBE Transform Group").property("ADBE Opacity"), "value * " + CTW + ".transform.opacity / 100");
    }
    var tg = PV.property("ADBE Transform Group");
    gexpr(tg.property("ADBE Position"), "var C = " + CTW + ", p = C.toComp(C.transform.anchorPoint);\n[p[0], p[1]]");
    gexpr(tg.property("ADBE Scale"), "var C = " + CTW + ", s = C.transform.scale;\n[s[0], s[1]]");
    gexpr(tg.property("ADBE Rotate Z"), CTW + ".transform.rotation");
    PV.locked = true;

    C.moveToBeginning();
    var helpers = [A, TI, SHD, INN, GLO, RM, CH, SH, MX, MY];
    for (var h = 0; h < helpers.length; h++) { try { helpers[h].shy = true; helpers[h].label = 0; } catch (e14) {} try { helpers[h].locked = true; } catch (e15) {} }
    try { P.label = 0; } catch (e16) {}
    try { comp.hideShyLayers = true; } catch (e17) {}
    return C;
}

function glassApply(o) {
    if (!comp) throw new Error("Open a composition first.");
    var sel = layers, ls = [];
    for (var i = 0; i < sel.length; i++) {
        var l = sel[i];
        var camOrLight = false; try { camOrLight = !!(l.property("ADBE Camera Options Group") || l.property("ADBE Light Options Group")); } catch (e0) {}
        if (camOrLight || l.adjustmentLayer) continue;
        if (gstarts(l.name, "SQ Glass")) continue;
        ls.push(l);
    }
    if (!ls.length) {
        var n = 0;
        for (var j = 0; j < sel.length; j++) {
            var fx = gfx(sel[j]); if (!fx) continue;
            for (var k = 0; k < GLASS_CTRL.length; k++) { var p = fx.property(GLASS_CTRL[k][0]); if (p && o[GLASS_CTRL[k][0]] !== undefined) { p.property(1).setValue(o[GLASS_CTRL[k][0]]); n++; } }
            var tp = fx.property(GLASS_TINT); if (tp && o[GLASS_TINT]) { try { tp.property(1).setValue(o[GLASS_TINT]); } catch (et) {} }
        }
        if (!n) throw new Error("Draw a shape (or select a text / shape layer) first.");
        return "Glass look updated";
    }
    if (!ls[0].setTrackMatte) throw new Error("Squeezy Glass needs After Effects 2023 or newer.");
    var folder = sqFolder("Squeezy Glass"), made = [];
    for (var a = 0; a < ls.length; a++) made.push(glassOne(comp, ls[a], o, folder));
    for (var b = 1; b <= comp.numLayers; b++) comp.layer(b).selected = false;
    for (var c = 0; c < made.length; c++) made[c].selected = true;
    return "Liquid glass on " + made.length + " layer" + (made.length === 1 ? "" : "s") + ". Move / scale / rotate the \"SQ Glass Controller\" layer";
}

function glassRemove() {
    if (!comp) throw new Error("Open a composition first.");
    var sel = layers, bases = {}, n = 0;
    for (var i = 0; i < sel.length; i++) {
        var m = String(sel[i].name).match(/^SQ Glass(?: [A-Za-z ]+)? \u00B7 (.+)$/);
        if (m) bases[m[1]] = 1;
    }
    for (var bb in bases) if (bases.hasOwnProperty(bb)) {
        for (var u = 1; u <= comp.numLayers; u++) { var U = comp.layer(u); if (String(U.name).indexOf("SQ Glass") === 0) { try { U.locked = false; } catch (eu) {} } }
        for (var k = comp.numLayers; k >= 1; k--) {
            var L = comp.layer(k), nm = String(L.name);
            if (nm === "SQ Glass Shape \u00B7 " + bb) {
                try {   // freeze the shape where the controller left it, then drop the pivot
                    var sc = L.source, pv = null;
                    for (var w = 1; w <= sc.numLayers; w++) if (sc.layer(w).name === "SQ Glass Pivot") pv = sc.layer(w);
                    if (pv) {
                        pv.locked = false;
                        var ptg = pv.property("ADBE Transform Group"), keep = [["ADBE Position"], ["ADBE Scale"], ["ADBE Rotate Z"]];
                        for (var e = 0; e < keep.length; e++) { var pr = ptg.property(keep[e][0]); var vv = pr.value; pr.expression = ""; pr.setValue(vv); }
                        for (var w2 = 1; w2 <= sc.numLayers; w2++) { var kid = sc.layer(w2); if (kid.parent && kid.parent.index === pv.index) { kid.parent = null; try { kid.property("ADBE Transform Group").property("ADBE Opacity").expression = ""; } catch (eo) {} } }
                        pv.remove();
                    }
                } catch (ep) {}
                L.enabled = true; L.name = bb; L.comment = ""; L.shy = false; continue;
            }
            if (nm.indexOf("SQ Glass") === 0 && nm.indexOf(" \u00B7 " + bb) === nm.length - (" \u00B7 " + bb).length) L.remove();
        }
        n++;
    }
    if (!n) throw new Error("Select a glass layer (SQ Glass \u00B7 ...) to remove.");
    return "Glass removed, your shape is back";
}

if (params.action === "remove") return glassRemove();
return glassApply(params.values || {});
