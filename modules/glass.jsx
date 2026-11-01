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
    ["SQ Glass Shadow", 35],
    ["SQ Glass Reed Bend", 0], ["SQ Glass Reed Width", 40], ["SQ Glass Reed Angle", 0], ["SQ Glass Reed Shade", 35]
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
    try { C.property("ADBE Transform Group").property("ADBE Opacity").setValue(100); } catch (eop) {}
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

    // reeded / fluted glass: one black->white ramp per rib, repeated across the frame (50% grey = no shift)
    function reedComp(name) {
        var c = newComp(name);
        c.layers.addSolid([0.5, 0.5, 0.5], "grey", c.width, c.height, c.pixelAspect, c.duration);
        var R = c.layers.addShape(); R.name = "reeds";
        var RW = "Math.max(" + CTL("SQ Glass Reed Width") + ", 2)", D = "Math.sqrt(thisComp.width*thisComp.width + thisComp.height*thisComp.height)";
        var root = function () { return R.property("ADBE Root Vectors Group"); };
        root().addProperty("ADBE Vector Group");
        var G = function () { return root().property(1); }, V = function () { return G().property("ADBE Vectors Group"); };
        V().addProperty("ADBE Vector Shape - Rect");
        V().addProperty("ADBE Vector Graphic - G-Fill");
        gexpr(V().property(1).property("ADBE Vector Rect Size"), "[" + RW + ", " + D + "]");
        try { V().property(2).property("ADBE Vector Grad Type").setValue(1); } catch (e0) {}
        gexpr(V().property(2).property("ADBE Vector Grad Start Pt"), "[-" + RW + "/2, 0]");
        gexpr(V().property(2).property("ADBE Vector Grad End Pt"), "[" + RW + "/2, 0]");
        gexpr(G().property("ADBE Vector Transform Group").property("ADBE Vector Position"),
            "var w = " + RW + ", n = Math.ceil(" + D + "/w) + 2;\n[-(n - 1) * w / 2, 0]");
        root().addProperty("ADBE Vector Filter - Repeater");
        var RP = function () { return root().property(2); };
        gexpr(RP().property("ADBE Vector Repeater Copies"), "Math.min(Math.ceil(" + D + "/" + RW + ") + 2, 600)");
        gexpr(RP().property("ADBE Vector Repeater Transform").property("ADBE Vector Repeater Position"), "[" + RW + ", 0]");
        var T = R.property("ADBE Transform Group");
        T.property("ADBE Anchor Point").setValue([0, 0]);
        T.property("ADBE Position").setValue([c.width / 2, c.height / 2]);
        gexpr(T.property("ADBE Rotate Z"), CTL("SQ Glass Reed Angle"));
        return c;
    }

    gstep("maps " + base);
    var rd = reedComp("SQ Glass Reeds \u00B7 " + base);
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
    // reeds: every rib shifts the image across itself (perpendicular to the ribs)
    var RD = comp.layers.add(rd); RD.name = rd.name; RD.moveAfter(MY); RD.enabled = false;
    var rdf = fxAdd(A, "ADBE Displacement Map", "SQ Glass Reed Shift");
    rdf.property(1).setValue(RD.index);
    rdf = gfx(A).property("SQ Glass Reed Shift");
    try { rdf.property(2).setValue(5); rdf.property(4).setValue(5); } catch (er1) {}
    var RB = CL + '.effect("SQ Glass Reed Bend")(1)', RA = CL + '.effect("SQ Glass Reed Angle")(1)*Math.PI/180';
    gexpr(rdf.property(3), RB + "*Math.cos(" + RA + ")");
    gexpr(gfx(A).property("SQ Glass Reed Shift").property(5), RB + "*Math.sin(" + RA + ")");
    try { gfx(A).property("SQ Glass Reed Shift").property(6).setValue(1); } catch (er2) {}
    try { gfx(A).property("SQ Glass Reed Shift").property(8).setValue(1); } catch (er3) {}
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
    // rib shading: each flute darker on one side, lighter on the other
    var RS = overlay(rd, BlendingMode.SOFT_LIGHT, "(" + GL + '.effect("SQ Glass Reed Bend")(1) > 0) ? ' + GL + '.effect("SQ Glass Reed Shade")(1) : 0'); RS.moveBefore(TI);

    // soft drop shadow under the glass (the glass refracts it too)
    var SH = comp.layers.add(shapeComp); SH.name = "SQ Glass Shadow \u00B7 " + base; SH.moveAfter(A);
    var sf = fxAdd(SH, "ADBE Fill"); try { sf.property(3).setValue([0, 0, 0, 1]); } catch (e12) {}
    fxAdd(SH, "ADBE Gaussian Blur 2", "SQ Shadow Blur");
    var SC = GL + '.effect("SQ Glass Shadow")(1)';
    gexpr(gfx(SH).property("SQ Shadow Blur").property(1), "8 + " + SC + "*0.6");
    gexpr(SH.property("ADBE Transform Group").property("ADBE Opacity"), SC + "*0.55");
    gexpr(SH.property("ADBE Transform Group").property("ADBE Position"), "value + [0, " + SC + "*0.35]");

    P.enabled = false;
    var all = [A, TI, SHD, INN, GLO, RM, CH, SH, P, MX, MY, RD, RS, C];
    for (var z = 0; z < all.length; z++) { try { all[z].inPoint = tin; all[z].outPoint = tout; } catch (e13) {} }
    P.comment = "Squeezy Glass: double-click to edit the shape. Move it with " + ctlName;

    // the shape follows the controller by DELTA from where the controller started:
    // at rest the expressions return exactly the shape's own values, so nothing can jump or vanish
    var CTW = 'comp("' + q2(comp.name) + '").layer("' + q2(ctlName) + '")';
    var c0v = ctr; try { c0v = C.property("ADBE Transform Group").property("ADBE Position").value; } catch (ec0) {}
    var c0op = 100; try { c0op = C.property("ADBE Transform Group").property("ADBE Opacity").value; } catch (ecop) {}
    var C0 = "[" + Number(c0v[0]).toFixed(3) + ", " + Number(c0v[1]).toFixed(3) + "]";
    for (var q = 1; q <= shapeComp.numLayers; q++) {
        var ch = shapeComp.layer(q), T = ch.property("ADBE Transform Group");
        if (ch.parent) continue;
        // pivot at the shape's centre (only when anchor / position are not animated)
        try {
            var ap = T.property("ADBE Anchor Point"), ps = T.property("ADBE Position");
            if (ap.numKeys === 0 && ps.numKeys === 0 && !ps.dimensionsSeparated) {
                var rr = ch.sourceRectAtTime(comp.time, false), av = ap.value, pv = ps.value;
                var cxl = rr.left + rr.width / 2, cyl = rr.top + rr.height / 2;
                var sc0 = T.property("ADBE Scale").value, ro = 0; try { ro = T.property("ADBE Rotate Z").value * Math.PI / 180; } catch (er) {}
                var dx = (cxl - av[0]) * sc0[0] / 100, dy = (cyl - av[1]) * sc0[1] / 100;
                var nx = pv[0] + dx * Math.cos(ro) - dy * Math.sin(ro), ny = pv[1] + dx * Math.sin(ro) + dy * Math.cos(ro);
                if (isFinite(nx) && isFinite(ny) && isFinite(cxl) && isFinite(cyl)) {
                    ap.setValue(av.length > 2 ? [cxl, cyl, av[2]] : [cxl, cyl]);
                    ps.setValue(pv.length > 2 ? [nx, ny, pv[2]] : [nx, ny]);
                }
            }
        } catch (ec) {}
        gexpr(T.property("ADBE Position"), "try { var c = " + CTW + ".transform.position, d = [c[0] - " + C0 + "[0], c[1] - " + C0 + "[1]];\n" +
            "value.length > 2 ? [value[0] + d[0], value[1] + d[1], value[2]] : [value[0] + d[0], value[1] + d[1]]; } catch (e) { value; }");
        gexpr(T.property("ADBE Scale"), "try { var s = " + CTW + ".transform.scale;\n" +
            "value.length > 2 ? [value[0] * s[0] / 100, value[1] * s[1] / 100, value[2]] : [value[0] * s[0] / 100, value[1] * s[1] / 100]; } catch (e) { value; }");
        gexpr(T.property("ADBE Rotate Z"), "try { value + " + CTW + ".transform.rotation; } catch (e) { value; }");
        gexpr(T.property("ADBE Opacity"), "try { value * " + CTW + ".transform.opacity / 100; } catch (e) { value; }");
        if (c0op <= 0) { try { T.property("ADBE Opacity").expression = ""; } catch (eo2) {} }
    }

    C.moveToBeginning();
    var helpers = [A, TI, SHD, INN, GLO, RM, CH, SH, MX, MY, RD, RS];
    for (var h = 0; h < helpers.length; h++) { try { helpers[h].shy = true; helpers[h].label = 0; } catch (e14) {} }
    try { P.label = 0; } catch (e16) {}
    try { comp.hideShyLayers = true; } catch (e17) {}
    return C;
}


// ---------- diagnostics: a plain-text picture of the rig, saved to the Desktop ----------
function gReportProp(pr) {
    var t = "";
    try { var v = pr.value; t += (v instanceof Array) ? "[" + v.join(", ") + "]" : String(v); } catch (e) { t += "?"; }
    try { if (pr.expression) t += "  expr" + (pr.expressionEnabled ? "" : "(OFF)") + (pr.expressionError ? " ERROR: " + pr.expressionError : ""); } catch (e2) {}
    return t;
}
function gReportLayer(L, out, pad) {
    var T = L.property("ADBE Transform Group"), line = pad + L.index + " " + L.name + " | on=" + L.enabled;
    try { line += " shy=" + L.shy + " in=" + L.inPoint.toFixed(2) + " out=" + L.outPoint.toFixed(2); } catch (e0) {}
    try { if (L.hasTrackMatte) line += " matte=" + L.trackMatteType + (L.trackMatteLayer ? " by " + L.trackMatteLayer.name : ""); } catch (e1) {}
    try { line += " blend=" + L.blendingMode; } catch (e3) {}
    out.push(line);
    var keys = [["A", "ADBE Anchor Point"], ["P", "ADBE Position"], ["S", "ADBE Scale"], ["R", "ADBE Rotate Z"], ["O", "ADBE Opacity"]];
    for (var k = 0; k < keys.length; k++) { try { out.push(pad + "   " + keys[k][0] + " " + gReportProp(T.property(keys[k][1]))); } catch (e4) {} }
    try { var r = L.sourceRectAtTime(L.containingComp.time, false); out.push(pad + "   rect " + [r.left, r.top, r.width, r.height].join(", ")); } catch (e5) {}
    try {
        var fx = gfx(L);
        for (var f = 1; fx && f <= fx.numProperties; f++) {
            var ef = fx.property(f), bad = [];
            for (var q = 1; q <= ef.numProperties; q++) { try { var pp = ef.property(q); if (pp.expression) bad.push(q + "=" + gReportProp(pp)); else if (pp.propertyValueType !== PropertyValueType.NO_VALUE && f <= 16 && /^SQ Glass/.test(ef.name) && q === 1) bad.push(gReportProp(pp)); } catch (e6) {} }
            out.push(pad + "   fx " + ef.name + " (" + ef.matchName + ")" + (ef.enabled ? "" : " OFF") + (bad.length ? " : " + bad.join(" ; ") : ""));
        }
    } catch (e7) {}
}
function glassReport(comp, note) {
    var out = ["Squeezy Glass report " + new Date().toString(), "AE " + app.version + " | comp " + comp.name + " " + comp.width + "x" + comp.height + " t=" + comp.time + " | " + (note || "")];
    var subs = {};
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        gReportLayer(L, out, "");
        try { if (L.source && L.source.numLayers !== undefined && /^SQ Glass/.test(L.source.name)) subs[L.source.name] = L.source; } catch (e) {}
    }
    for (var n in subs) if (subs.hasOwnProperty(n)) {
        out.push(""); out.push("== comp " + n);
        for (var j = 1; j <= subs[n].numLayers; j++) gReportLayer(subs[n].layer(j), out, "  ");
    }
    try {
        var f = new File(Folder.desktop.fsName + "/Squeezy Glass Report.txt");
        f.encoding = "UTF-8"; f.open("w"); f.write(out.join("\n")); f.close();
    } catch (ew) {}
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
            if (gstarts(sel[j].name, "SQ Glass Controller")) { try { var op = sel[j].property("ADBE Transform Group").property("ADBE Opacity"); if (op.numKeys === 0 && op.value === 0) op.setValue(100); } catch (eop2) {} }
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
    for (var b = 1; b <= comp.numLayers; b++) { try { comp.layer(b).selected = false; } catch (eb) {} }
    for (var c = 0; c < made.length; c++) { try { made[c].selected = true; } catch (ec) {} }
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
                try {   // freeze the shape where the controller left it
                    var sc = L.source;
                    for (var w = 1; w <= sc.numLayers; w++) {
                        var kid = sc.layer(w), kt = kid.property("ADBE Transform Group");
                        if (kid.name === "SQ Glass Pivot") { kid.remove(); w--; continue; }   // rigs from v2
                        var keep = ["ADBE Position", "ADBE Scale", "ADBE Rotate Z", "ADBE Opacity"];
                        for (var e = 0; e < keep.length; e++) {
                            var pr = kt.property(keep[e]);
                            if (pr && pr.expression && pr.expression.indexOf("SQ Glass Controller") >= 0) {
                                var vv = pr.value; pr.expression = ""; if (pr.numKeys === 0) pr.setValue(vv);
                            }
                        }
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
