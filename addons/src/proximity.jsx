// Squeezy add-on: Squeezy Proximity (original Squeezy code)
// Layers react to their distance from one or more effector nulls.
// runs as function(params, comp, layers)
if (!comp) return "Open a composition first.";

var CTRL = "SQ Proximity Controller";
var EFF = "SQ Effector ";
var MARK = "// SQ-PROX";
var act = String(params.action || "Apply to selected");

function q(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function byName(n) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === n) return comp.layer(i); return null; }
function isRig(l) { var n = String(l.name); return n === CTRL || n.indexOf(EFF) === 0; }
function tr(l) { return l.property("ADBE Transform Group"); }
function num(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }
function maxEff() {
    var m = 0;
    for (var i = 1; i <= comp.numLayers; i++) {
        var mm = String(comp.layer(i).name).match(/^SQ Effector (\d+)$/);
        if (mm && parseInt(mm[1], 10) > m) m = parseInt(mm[1], 10);
    }
    return m;
}
function setExpr(p, e) { if (!p) return false; try { p.expression = e; return true; } catch (er) { return false; } }

// ---------- expressions ----------
var CR = 'var C=thisComp.layer("' + q(CTRL) + '"); var cv=function(n){ return C.effect(n)(1).value; };\n';
function core(X) {
    return [
        CR,
        'var R=Math.max(1,cv("Radius")), F=Math.min(Math.max(cv("Softness"),0),100)/100, K=Math.max(0.05,cv("Curve")), S=cv("Strength")/100;',
        'var N=Math.round(cv("Effectors")), T=time-cv("Delay (frames)")*thisComp.frameDuration, D3=(cv("3D Distance")>0.5)&&thisLayer.threeDLayer;',
        'var P0=' + X + ', P1=hasParent?parent.toWorld(P0):P0, ME=[P1[0],P1[1],P1.length>2?P1[2]:0];',
        'var W=0, DX=0, DY=-1;',
        'for (var k=1;k<=N;k++){',
        '  var E=null; try{ E=thisComp.layer("' + q(EFF) + '"+k); }catch(er){ E=null; }',
        '  if(!E) continue;',
        '  var Q=E.toWorld(E.anchorPoint,T);',
        '  var dx=ME[0]-Q[0], dy=ME[1]-Q[1], dz=(D3&&E.threeDLayer)?ME[2]-Q[2]:0;',
        '  var d=Math.sqrt(dx*dx+dy*dy+dz*dz), inn=R*(1-F);',
        '  var t=d<=inn?1:(d>=R?0:1-(d-inn)/Math.max(0.001,R-inn));',
        '  t=t*t*(3-2*t); t=Math.pow(t,K);',
        '  if(t>W){ W=t; var dl=Math.sqrt(dx*dx+dy*dy); if(dl>0.001){ DX=dx/dl; DY=dy/dl; } }',
        '}',
        'if(cv("Invert")>0.5) W=1-W;',
        'W=W*S;'
    ].join("\n");
}
var X_WEIGHT = MARK + " weight\nvar __r=0;\ntry{\n" + core("transform.position.value") + "\n__r=W*100;\n}catch(err){ __r=0; }\n__r";
// push / lift live on the Anchor Point so Position stays untouched (no feedback into the distance)
var X_POS = MARK + " push\nvar __r=value;\ntry{\n" + core("transform.position.value") +
    '\nvar A=cv("Push ON")*cv("Push")*W, Z=cv("Lift Z ON")*cv("Lift Z")*W;' +
    '\nvar ox=DX*A, oy=DY*A;' +
    '\nif(hasParent){ var a0=parent.fromWorld(ME), a1=parent.fromWorld([ME[0]+ox,ME[1]+oy,ME[2]]); ox=a1[0]-a0[0]; oy=a1[1]-a0[1]; }' +
    '\nvar sc=transform.scale.value, rr=-transform.rotation.value*Math.PI/180;' +
    '\nvar sd=function(v){ v=v/100; return Math.abs(v)<0.0001?(v<0?-0.0001:0.0001):v; };' +
    '\nvar lx=(ox*Math.cos(rr)-oy*Math.sin(rr))/sd(sc[0]), ly=(ox*Math.sin(rr)+oy*Math.cos(rr))/sd(sc[1]);' +
    '\n__r=value.length>2?[value[0]-lx,value[1]-ly,value[2]+Z/sd(sc.length>2?sc[2]:100)]:[value[0]-lx,value[1]-ly];' +
    "\n}catch(err){ __r=value; }\n__r";
function wrap(tag, body) {
    return MARK + " " + tag + "\nvar __r=value;\ntry{\n" + CR +
        'var W=effect("SQ Prox Weight")(1).value/100;\n' + body + "\n}catch(err){ __r=value; }\n__r";
}
var X_SCALE = wrap("scale", '__r=mul(value, Math.max(0, 1+cv("Scale ON")*cv("Scale")/100*W));');
var X_OPAC = wrap("opacity", '__r=clamp(value+W*cv("Opacity ON")*cv("Opacity"),0,100);');
var X_ROT = wrap("rotation", '__r=value+W*cv("Rotation ON")*cv("Rotation");');
var X_BLUR = wrap("blur", '__r=Math.max(0,W*cv("Blur ON")*cv("Blur"));');
var X_TINTA = wrap("tint", '__r=clamp(W*cv("Tint ON")*cv("Tint Amount"),0,100);');
var X_TINTC = MARK + ' tint colour\nvar __r=value;\ntry{ __r=thisComp.layer("' + q(CTRL) + '").effect("Tint Color")(1).value; }catch(err){ __r=value; }\n__r';

// ---------- rig pieces ----------
// controller layout, in Effect Controls order: [name, kind, value]
function layout() {
    var t = "#2FF3FF"; try { if (/^#?[0-9a-f]{6}$/i.test(String(params.tintColor))) t = String(params.tintColor); } catch (e) {}
    function on(id, d) { return params[id] === undefined ? d : !!params[id]; }
    return [
        ["Radius", "s", num(params.radius, 300)], ["Softness", "s", num(params.softness, 70)], ["Curve", "s", num(params.curve, 1)],
        ["Strength", "s", 100], ["Invert", "c", on("invert", false)], ["3D Distance", "c", on("use3d", true)],
        ["Delay (frames)", "s", num(params.delay, 0)], ["Effectors", "s", 0],
        ["Scale ON", "c", on("scale", true)], ["Scale", "s", num(params.scaleAmt, 60)],
        ["Opacity ON", "c", on("opacity", false)], ["Opacity", "s", num(params.opacityAmt, -70)],
        ["Rotation ON", "c", on("rotation", false)], ["Rotation", "s", num(params.rotationAmt, 45)],
        ["Push ON", "c", on("push", false)], ["Push", "s", num(params.pushAmt, 80)],
        ["Lift Z ON", "c", on("lift", false)], ["Lift Z", "s", num(params.liftAmt, 300)],
        ["Blur ON", "c", on("blur", false)], ["Blur", "s", num(params.blurAmt, 20)],
        ["Tint ON", "c", on("tint", false)], ["Tint Color", "k", sqHex(t)], ["Tint Amount", "s", num(params.tintAmt, 100)]
    ];
}
function controller(update) {
    var c = byName(CTRL), fresh = false;
    if (!c) {
        c = comp.layers.addNull(comp.duration);
        c.name = CTRL; c.label = 11; fresh = true;
        try { tr(c).property("ADBE Position").setValue([80, 80]); } catch (e) {}
    }
    try { tr(c).property("ADBE Opacity").setValue(100); } catch (e0) {}
    // a controller from v1 has no ON boxes: rebuild it in the new order
    if (!fresh && !sqFx(c).property("Scale ON")) {
        var fx = sqFx(c); for (var r = fx.numProperties; r >= 1; r--) sqFx(c).property(r).remove();
        fresh = true;
    }
    var L = layout(), set = fresh || update;
    for (var i = 0; i < L.length; i++) {
        var n = L[i][0], kind = L[i][1], v = L[i][2], have = sqFx(c).property(n);
        if (!have) {
            if (kind === "s") sqSlider(c, n, v);
            else if (kind === "c") sqCheckbox(c, n, v);
            else sqCtrl(c, "ADBE Color Control", n, v);
        } else if (set) {
            try { sqFx(c).property(n).property(1).setValue(kind === "c" ? (v ? 1 : 0) : v); } catch (e1) {}
        }
    }
    return c;
}
function syncCount(c) { try { sqFx(c).property("Effectors").property(1).setValue(maxEff()); } catch (e) {} }

function ring(eff) {
    var s = comp.layers.addShape();
    s.name = eff.name + " Ring";
    s.guideLayer = true; s.label = eff.label;
    s.moveAfter(eff);
    s.parent = eff;
    try { tr(s).property("ADBE Position").setValue(tr(eff).property("ADBE Anchor Point").value); } catch (e) {}
    // AE invalidates property references when siblings are added, so every step re-reads from the layer
    function circle(name, expr, op) {
        var gi = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").propertyIndex;
        var G = function () { return s.property("ADBE Root Vectors Group").property(gi); };
        G().name = name;
        var V = function () { return G().property("ADBE Vectors Group"); };
        V().addProperty("ADBE Vector Shape - Ellipse");
        V().addProperty("ADBE Vector Graphic - Stroke");
        setExpr(V().property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size"), expr);
        var ST = function () { return V().property("ADBE Vector Graphic - Stroke"); };
        try { ST().property("ADBE Vector Stroke Color").setValue([0.18, 0.95, 1, 1]); } catch (e1) {}
        try { ST().property("ADBE Vector Stroke Width").setValue(2); } catch (e2) {}
        try { ST().property("ADBE Vector Stroke Opacity").setValue(op); } catch (e3) {}
    }
    var src = 'var C=thisComp.layer("' + q(CTRL) + '"); var R=C.effect("Radius")(1).value; ';
    circle("Radius", src + "[R*2,R*2]", 90);
    circle("Core", src + 'var F=Math.min(Math.max(C.effect("Softness")(1).value,0),100)/100; var r=R*(1-F)*2; [r,r]', 40);
    return s;
}
function addEffector(is3d, follow) {
    var k = maxEff() + 1;
    var e = comp.layers.addNull(comp.duration);
    e.name = EFF + k; e.label = 2;
    try { tr(e).property("ADBE Opacity").setValue(100); } catch (e0) {}
    if (is3d) try { e.threeDLayer = true; } catch (e1) {}
    if (follow) {
        e.parent = follow;
        try { var ap = tr(follow).property("ADBE Anchor Point").value; tr(e).property("ADBE Position").setValue(is3d ? [ap[0], ap[1], ap.length > 2 ? ap[2] : 0] : [ap[0], ap[1]]); } catch (e2) {}
    } else {
        try { tr(e).property("ADBE Position").setValue(is3d ? [comp.width / 2, comp.height / 2, 0] : [comp.width / 2, comp.height / 2]); } catch (e3) {}
    }
    e.moveToBeginning();
    try { ring(e); } catch (er) {}   // the guide ring is optional, never let it stop the rig
    return e;
}

function unrig(l) {
    var t = tr(l), n = 0;
    var props = [t.property("ADBE Anchor Point"), t.property("ADBE Position"), t.property("ADBE Scale"), t.property("ADBE Opacity"), t.property("ADBE Rotate Z")];
    for (var i = 0; i < props.length; i++) {
        var p = props[i];
        try { if (p && String(p.expression).indexOf("SQ-PROX") >= 0) { p.expression = ""; n++; } } catch (e) {}
    }
    var fx = sqFx(l);
    if (fx) for (var j = fx.numProperties; j >= 1; j--) if (String(fx.property(j).name).indexOf("SQ Prox") === 0) { fx.property(j).remove(); n++; }
    return n;
}
function drivesEffector(l) {
    for (var i = 1; i <= comp.numLayers; i++) {
        var c = comp.layer(i);
        if (String(c.name).indexOf(EFF) === 0 && c.parent && c.parent.index === l.index) return true;
    }
    return false;
}
function targets(all) {
    var out = [], src = [];
    if (all) { for (var i = 1; i <= comp.numLayers; i++) src.push(comp.layer(i)); } else src = layers;
    for (var j = 0; j < src.length; j++) {
        var l = src[j];
        if (isRig(l) || sqIsCamOrLight(l) || !tr(l)) continue;
        out.push(l);
    }
    return out;
}

// ---------- actions ----------
if (act === "Remove rig") {
    var all = !layers.length, list = targets(all), cleaned = 0;
    for (var r = 0; r < list.length; r++) if (unrig(list[r])) cleaned++;
    var left = 0;
    for (var a = 1; a <= comp.numLayers; a++) { var fxp = sqFx(comp.layer(a)); if (fxp && fxp.property("SQ Prox Weight")) left++; }
    var gone = 0;
    if (!left) {
        for (var z = comp.numLayers; z >= 1; z--) if (isRig(comp.layer(z))) { comp.layer(z).remove(); gone++; }
    }
    if (!cleaned && !gone) return "Nothing to remove: no Proximity rig found.";
    return "Proximity removed from " + cleaned + " layer" + (cleaned === 1 ? "" : "s") + (gone ? " and the controller / effectors deleted" : "");
}

if (act === "Add effector" || act === "Effector from selected layer") {
    var c0 = controller(false);
    var any3 = false;
    for (var b = 1; b <= comp.numLayers; b++) { var fb = sqFx(comp.layer(b)); if (fb && fb.property("SQ Prox Weight") && comp.layer(b).threeDLayer) any3 = true; }
    var made = 0;
    if (act === "Add effector") { addEffector(any3, null); made = 1; }
    else {
        var src2 = targets(false);
        if (!src2.length) return "Select the layer(s) the effector should follow.";
        for (var f = 0; f < src2.length; f++) {
            var fx2 = sqFx(src2[f]);
            if (fx2 && fx2.property("SQ Prox Weight")) continue; // a rigged layer cannot drive the rig (loop)
            addEffector(src2[f].threeDLayer || any3, src2[f]); made++;
        }
        if (!made) return "Those layers react to the rig, so they cannot drive it. Pick another layer.";
    }
    syncCount(c0);
    return made + " effector" + (made > 1 ? "s" : "") + " added. Animate it, or move it around, to push the layers.";
}

// Apply to selected
var tg = targets(false);
if (!tg.length) return "Select the layers that should react.";
var C0 = controller(params.update !== false);
var has3 = false;
for (var h = 0; h < tg.length; h++) if (tg[h].threeDLayer) has3 = true;
if (!maxEff()) addEffector(has3, null);
syncCount(C0);

var done = 0, notes = [];
for (var i = 0; i < tg.length; i++) {
    var l = tg[i];
    if (drivesEffector(l)) { notes.push(l.name + " drives an effector"); continue; }
    try {
    unrig(l);
    var w = sqSlider(l, "SQ Prox Weight", 0);
    setExpr(w.property(1), X_WEIGHT);
    setExpr(tr(l).property("ADBE Scale"), X_SCALE);
    setExpr(tr(l).property("ADBE Opacity"), X_OPAC);
    setExpr(tr(l).property("ADBE Rotate Z"), X_ROT);
    setExpr(tr(l).property("ADBE Anchor Point"), X_POS);
    sqFx(l).addProperty("ADBE Gaussian Blur 2").name = "SQ Prox Blur";
    try { sqFx(l).property("SQ Prox Blur").property(3).setValue(1); } catch (e4) {}
    setExpr(sqFx(l).property("SQ Prox Blur").property(1), X_BLUR);
    sqFx(l).addProperty("ADBE Tint").name = "SQ Prox Tint";
    setExpr(sqFx(l).property("SQ Prox Tint").property(1), X_TINTC);
    setExpr(sqFx(l).property("SQ Prox Tint").property(2), X_TINTC);
    setExpr(sqFx(l).property("SQ Prox Tint").property(3), X_TINTA);
    done++;
    } catch (err) { notes.push(l.name + ": " + (err && err.message ? err.message : err) + (err && err.line ? " (line " + err.line + ")" : "")); }
}
if (!done) return "Nothing rigged: " + notes.join("; ");
return "Proximity on " + done + " layer" + (done > 1 ? "s" : "") + ". Move \"" + EFF + "1\" to see it; turn properties on/off with the ON boxes on \"" + CTRL + "\"." + (notes.length ? " (" + notes.join("; ") + ")" : "");
