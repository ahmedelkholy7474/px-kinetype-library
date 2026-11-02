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
    '\nvar A=cv("Push")*W, Z=cv("Lift Z")*W;' +
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
var X_SCALE = wrap("scale", '__r=mul(value, Math.max(0, 1+cv("Scale")/100*W));');
var X_OPAC = wrap("opacity", '__r=clamp(value+W*cv("Opacity"),0,100);');
var X_ROT = wrap("rotation", '__r=value+W*cv("Rotation");');
var X_BLUR = wrap("blur", '__r=Math.max(0,W*cv("Blur"));');
var X_TINTA = wrap("tint", '__r=clamp(W*cv("Tint Amount"),0,100);');
var X_TINTC = MARK + ' tint colour\nvar __r=value;\ntry{ __r=thisComp.layer("' + q(CTRL) + '").effect("Tint Color")(1).value; }catch(err){ __r=value; }\n__r';

// ---------- rig pieces ----------
function controller(update) {
    var c = byName(CTRL), fresh = false;
    if (!c) {
        c = comp.layers.addNull(comp.duration);
        c.name = CTRL; c.label = 11; fresh = true;
        try { tr(c).property("ADBE Position").setValue([80, 80]); } catch (e) {}
    }
    try { tr(c).property("ADBE Opacity").setValue(100); } catch (e0) {}
    var s = (fresh || update);
    function sl(n, v) { var p = sqFx(c).property(n); if (!p) return sqSlider(c, n, v); if (s) try { p.property(1).setValue(v); } catch (e) {} return p; }
    sl("Radius", num(params.radius, 300));
    sl("Softness", num(params.softness, 70));
    sl("Curve", num(params.curve, 1));
    sl("Strength", 100);
    if (!sqFx(c).property("Invert")) sqCheckbox(c, "Invert", params.invert); else if (s) try { sqFx(c).property("Invert").property(1).setValue(params.invert ? 1 : 0); } catch (e1) {}
    if (!sqFx(c).property("3D Distance")) sqCheckbox(c, "3D Distance", params.use3d !== false); else if (s) try { sqFx(c).property("3D Distance").property(1).setValue(params.use3d !== false ? 1 : 0); } catch (e2) {}
    sl("Delay (frames)", num(params.delay, 0));
    sl("Effectors", 0);
    sl("Scale", num(params.scaleAmt, 60));
    sl("Opacity", num(params.opacityAmt, -70));
    sl("Rotation", num(params.rotationAmt, 45));
    sl("Push", num(params.pushAmt, 80));
    sl("Lift Z", num(params.liftAmt, 300));
    sl("Blur", num(params.blurAmt, 20));
    if (!sqFx(c).property("Tint Color")) sqCtrl(c, "ADBE Color Control", "Tint Color", sqHex(params.tintColor || "#2FF3FF"));
    else if (s) try { sqFx(c).property("Tint Color").property(1).setValue(sqHex(params.tintColor || "#2FF3FF")); } catch (e3) {}
    sl("Tint Amount", num(params.tintAmt, 100));
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
    var root = s.property("ADBE Root Vectors Group");
    function circle(name, expr, op) {
        var g = root.addProperty("ADBE Vector Group"); g.name = name;
        var v = g.property("ADBE Vectors Group");
        var el = v.addProperty("ADBE Vector Shape - Ellipse");
        setExpr(el.property("ADBE Vector Ellipse Size"), expr);
        var st = v.addProperty("ADBE Vector Graphic - Stroke");
        try { st.property("ADBE Vector Stroke Color").setValue([0.18, 0.95, 1, 1]); } catch (e1) {}
        try { st.property("ADBE Vector Stroke Width").setValue(2); } catch (e2) {}
        try { st.property("ADBE Vector Stroke Opacity").setValue(op); } catch (e3) {}
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
    ring(e);
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
var ch = {
    scale: params.scale !== false, opacity: !!params.opacity, rotation: !!params.rotation,
    push: !!params.push, lift: !!params.lift, blur: !!params.blur, tint: !!params.tint
};
if (!(ch.scale || ch.opacity || ch.rotation || ch.push || ch.lift || ch.blur || ch.tint)) return "Turn on at least one property (Scale, Opacity, ...).";

var C0 = controller(params.update !== false);
var has3 = false;
for (var h = 0; h < tg.length; h++) if (tg[h].threeDLayer) has3 = true;
if (!maxEff()) addEffector(has3, null);
syncCount(C0);

var done = 0, notes = [];
for (var i = 0; i < tg.length; i++) {
    var l = tg[i];
    if (drivesEffector(l)) { notes.push(l.name + " drives an effector"); continue; }
    unrig(l);
    var w = sqSlider(l, "SQ Prox Weight", 0);
    setExpr(w.property(1), X_WEIGHT);
    var T = tr(l);
    if (ch.scale) setExpr(T.property("ADBE Scale"), X_SCALE);
    if (ch.opacity) setExpr(T.property("ADBE Opacity"), X_OPAC);
    if (ch.rotation) setExpr(T.property("ADBE Rotate Z"), X_ROT);
    if (ch.push || ch.lift) setExpr(T.property("ADBE Anchor Point"), X_POS);
    if (ch.blur) {
        var bl = sqFx(l).addProperty("ADBE Gaussian Blur 2"); bl.name = "SQ Prox Blur";
        bl = sqFx(l).property("SQ Prox Blur");
        try { bl.property(3).setValue(1); } catch (e4) {}
        setExpr(bl.property(1), X_BLUR);
    }
    if (ch.tint) {
        var tn = sqFx(l).addProperty("ADBE Tint"); tn.name = "SQ Prox Tint";
        tn = sqFx(l).property("SQ Prox Tint");
        setExpr(tn.property(1), X_TINTC);
        setExpr(tn.property(2), X_TINTC);
        setExpr(tn.property(3), X_TINTA);
    }
    done++;
}
if (!done) return "Nothing rigged: " + notes.join("; ");
return "Proximity on " + done + " layer" + (done > 1 ? "s" : "") + ". Move \"" + EFF + "1\" to see it; tweak everything on \"" + CTRL + "\"." + (notes.length ? " (" + notes.join("; ") + ")" : "");
