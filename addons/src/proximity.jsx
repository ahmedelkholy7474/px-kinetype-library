// Squeezy add-on: Squeezy Proximity v3 (original Squeezy code)
// Layers react to how close an effector null is. Pick a Look, press Apply, move the effector.
// runs as function(params, comp, layers)
if (!comp) return "Open a composition first.";

var CTRL = "SQ Proximity Controller";
var EFF = "SQ Effector ";
var MAXEFF = 10;
var act = String(params.action || "Apply");

// Look -> which boxes start ON and their amounts
// Looks: which boxes switch ON and their amounts. Several looks can be mixed.
//   Opacity %: + = far layers fade (near stays solid, "Reveal")   - = near layers fade
//   Blur px:   + = near layers blur                               - = far layers blur ("Focus")
var LOOKS = {
    "Magnify":   { on: { scale: 1 }, scale: 60 },
    "Shrink":    { on: { scale: 1 }, scale: -60 },
    "Reveal":    { on: { opacity: 1 }, opacity: 100 },
    "Fade out":  { on: { opacity: 1 }, opacity: -100 },
    "Push away": { on: { position: 1 }, position: 120 },
    "Pull in":   { on: { position: 1 }, position: -120 },
    "Spin":      { on: { rotation: 1 }, rotation: 180 },
    "Focus":     { on: { blur: 1 }, blur: -30 },
    "Color":     { on: { color: 1 } },
    "Pop":       { on: { scale: 1, rotation: 1, color: 1 }, scale: 50, rotation: 20 }
};
function lookList() {
    var l = params.looks;
    if (!(l instanceof Array)) l = l ? String(l).split(",") : [];
    if (!l.length && params.look) l = [String(params.look)];          // panels before 3.0
    var out = [];
    for (var i = 0; i < l.length; i++) if (LOOKS[l[i]]) out.push(l[i]);
    return out.length ? out : ["Magnify"];
}
function q(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function byName(n) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === n) return comp.layer(i); return null; }
function isRig(l) { var n = String(l.name); return n === CTRL || n.indexOf(EFF) === 0; }
function tr(l) { return l.property("ADBE Transform Group"); }
function num(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }
function setExpr(p, e) { if (!p) return false; try { p.expression = e; return true; } catch (er) { return false; } }
function freeEff() {
    for (var k = 1; k <= MAXEFF; k++) if (!byName(EFF + k)) return k;
    return 0;
}
function anyEff() { for (var k = 1; k <= MAXEFF; k++) if (byName(EFF + k)) return true; return false; }

// ---------- expressions ----------
var MARK = "// SQ-PROX";
var CR = 'var C=thisComp.layer("' + q(CTRL) + '"); var cv=function(n){ return C.effect(n)(1).value; };\n';
// W = 0..1 influence, DX/DY = direction away from the nearest effector
var CORE = [
    CR,
    'var R=Math.max(1,cv("Radius")), F=Math.min(Math.max(cv("Softness"),0),100)/100, S=cv("Amount")/100;',
    'var P0=transform.position.value, P1=hasParent?parent.toWorld(P0):P0, ME=[P1[0],P1[1],P1.length>2?P1[2]:0];',
    'var W=0, DX=0, DY=-1;',
    'for (var k=1;k<=' + MAXEFF + ';k++){',
    '  var E=null; try{ E=thisComp.layer("' + q(EFF) + '"+k); }catch(er){ E=null; }',
    '  if(!E) continue;',
    '  var Q=E.toWorld(E.anchorPoint);',
    '  var dx=ME[0]-Q[0], dy=ME[1]-Q[1], dz=(E.threeDLayer&&thisLayer.threeDLayer)?ME[2]-Q[2]:0;',
    '  var d=Math.sqrt(dx*dx+dy*dy+dz*dz), inn=R*(1-F);',
    '  var t=d<=inn?1:(d>=R?0:1-(d-inn)/Math.max(0.001,R-inn));',
    '  t=t*t*(3-2*t);',
    '  if(t>W){ W=t; var dl=Math.sqrt(dx*dx+dy*dy); if(dl>0.001){ DX=dx/dl; DY=dy/dl; } }',
    '}',
    'if(cv("Invert")>0.5) W=1-W;',
    'W=W*S;'
].join("\n");
function body(tag, code) { return MARK + " " + tag + "\nvar __r=value;\ntry{\n" + code + "\n}catch(err){ __r=value; }\n__r"; }
var X_WEIGHT = MARK + " weight\nvar __r=0;\ntry{\n" + CORE + "\n__r=W*100;\n}catch(err){ __r=0; }\n__r";
function useW(code) { return CR + 'var W=effect("SQ Prox Weight")(1).value/100;\n' + code; }
var X_SCALE = body("scale", useW('__r=mul(value, Math.max(0, 1+cv("Scale")*cv("Scale %")/100*W));'));
var X_OPAC = body("opacity", useW('var a=cv("Opacity")*cv("Opacity %")/100; __r=clamp(a>=0 ? value*(1-a*(1-W)) : value*(1+a*W),0,100);'));
var X_ROT = body("rotation", useW('__r=value+W*cv("Rotation")*cv("Rotation deg");'));
var X_BLUR = body("blur", useW('var a=cv("Blur")*cv("Blur px"); __r=Math.max(0, a>=0 ? a*W : -a*(1-W));'));
var X_TINTA = body("color", useW('__r=clamp(W*cv("Color")*100,0,100);'));
var X_TINTC = body("color pick", 'var __c=thisComp.layer("' + q(CTRL) + '").effect("Color Pick")(1).value; __r=__c;');
// push lives on the Anchor Point, so Position (and the distance) is never touched
var X_PUSH = body("position", CORE +
    '\nvar A=cv("Position")*cv("Position px")*W, ox=DX*A, oy=DY*A;' +
    '\nif(hasParent){ var a0=parent.fromWorld(ME), a1=parent.fromWorld([ME[0]+ox,ME[1]+oy,ME[2]]); ox=a1[0]-a0[0]; oy=a1[1]-a0[1]; }' +
    '\nvar sc=transform.scale.value, rr=-transform.rotation.value*Math.PI/180;' +
    '\nvar sd=function(v){ v=v/100; return Math.abs(v)<0.0001?(v<0?-0.0001:0.0001):v; };' +
    '\nvar lx=(ox*Math.cos(rr)-oy*Math.sin(rr))/sd(sc[0]), ly=(ox*Math.sin(rr)+oy*Math.cos(rr))/sd(sc[1]);' +
    '\n__r=value.length>2?[value[0]-lx,value[1]-ly,value[2]]:[value[0]-lx,value[1]-ly];');

// ---------- controller ----------
function layout(looks) {
    var on = {}, amt = {};
    for (var i = 0; i < looks.length; i++) {
        var L = LOOKS[looks[i]];
        for (var k in L.on) if (L.on.hasOwnProperty(k)) on[k] = 1;
        var keys = ["scale", "opacity", "rotation", "position", "blur"];
        for (var j = 0; j < keys.length; j++) if (L[keys[j]] !== undefined) amt[keys[j]] = L[keys[j]];
    }
    var hex = "#2FF3FF"; try { if (/^#?[0-9a-f]{6}$/i.test(String(params.color))) hex = String(params.color); } catch (e) {}
    function a(k, d) { return amt[k] !== undefined ? amt[k] : d; }
    return [
        ["Radius", "s", num(params.radius, 300)],
        ["Softness", "s", num(params.softness, 70)],
        ["Amount", "s", num(params.amount, 100)],
        ["Invert", "c", params.invert ? 1 : 0],
        ["Scale", "c", on.scale ? 1 : 0], ["Scale %", "s", a("scale", 60)],
        ["Opacity", "c", on.opacity ? 1 : 0], ["Opacity %", "s", a("opacity", 100)],
        ["Rotation", "c", on.rotation ? 1 : 0], ["Rotation deg", "s", a("rotation", 90)],
        ["Position", "c", on.position ? 1 : 0], ["Position px", "s", a("position", 120)],
        ["Blur", "c", on.blur ? 1 : 0], ["Blur px", "s", a("blur", -30)],
        ["Color", "c", on.color ? 1 : 0], ["Color Pick", "k", sqHex(hex)]
    ];
}
function controller(looks) {
    var look = looks.join(" + ");
    var c = byName(CTRL), fresh = false;
    if (!c) {
        c = comp.layers.addNull(comp.duration);
        c.name = CTRL; c.label = 11; fresh = true;
        try { tr(c).property("ADBE Position").setValue([80, 80]); } catch (e) {}
    }
    try { tr(c).property("ADBE Opacity").setValue(100); } catch (e0) {}
    // older controllers (v1/v2) used other names: rebuild
    if (!fresh && (!sqFx(c).property("Position px") || sqFx(c).property("Scale ON"))) {
        for (var r = sqFx(c).numProperties; r >= 1; r--) sqFx(c).property(r).remove();
        fresh = true;
    }
    // the Look only overwrites the controller when you pick a different one (your tweaks survive re-Apply)
    var same = String(c.comment) === "SQ-PROX look:" + look;
    var L = layout(looks);
    for (var i = 0; i < L.length; i++) {
        var n = L[i][0], kind = L[i][1], v = L[i][2], have = sqFx(c).property(n);
        if (!have) {
            if (kind === "s") sqSlider(c, n, v);
            else if (kind === "c") sqCheckbox(c, n, v);
            else sqCtrl(c, "ADBE Color Control", n, v);
        } else if (!same || n === "Radius" || n === "Softness" || n === "Amount" || n === "Invert" || n === "Color Pick") {
            try { sqFx(c).property(n).property(1).setValue(kind === "c" ? (v ? 1 : 0) : v); } catch (e1) {}
        }
    }
    try { c.comment = "SQ-PROX look:" + look; } catch (e2) {}
    return c;
}

// ---------- effector ----------
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
}
function addEffector(is3d, follow) {
    var k = freeEff();
    if (!k) throw new Error("You already have " + MAXEFF + " effectors.");
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

// ---------- layers ----------
function rigged(l) { var f = sqFx(l); return !!(f && f.property("SQ Prox Weight")); }
function unrig(l) {
    var t = tr(l), n = 0;
    var props = [t.property("ADBE Anchor Point"), t.property("ADBE Position"), t.property("ADBE Scale"), t.property("ADBE Opacity"), t.property("ADBE Rotate Z")];
    for (var i = 0; i < props.length; i++) {
        try { if (props[i] && String(props[i].expression).indexOf("SQ-PROX") >= 0) { props[i].expression = ""; n++; } } catch (e) {}
    }
    var fx = sqFx(l);
    if (fx) for (var j = fx.numProperties; j >= 1; j--) if (String(sqFx(l).property(j).name).indexOf("SQ Prox") === 0) { sqFx(l).property(j).remove(); n++; }
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
function any3D() { for (var b = 1; b <= comp.numLayers; b++) if (rigged(comp.layer(b)) && comp.layer(b).threeDLayer) return true; return false; }

// ---------- actions ----------
if (act === "Remove") {
    var list = targets(!layers.length), cleaned = 0;
    for (var r = 0; r < list.length; r++) if (unrig(list[r])) cleaned++;
    var left = 0, gone = 0;
    for (var a = 1; a <= comp.numLayers; a++) if (rigged(comp.layer(a))) left++;
    if (!left) for (var z = comp.numLayers; z >= 1; z--) if (isRig(comp.layer(z))) { comp.layer(z).remove(); gone++; }
    if (!cleaned && !gone) return "No Proximity found here.";
    return "Proximity removed" + (cleaned ? " from " + cleaned + " layer" + (cleaned === 1 ? "" : "s") : "") + (gone ? ", controller and effectors deleted" : "") + ".";
}

if (act === "Add effector") {
    if (!byName(CTRL)) return "Apply Proximity to some layers first.";
    var e1 = addEffector(any3D(), null);
    return "\"" + e1.name + "\" added in the middle of the comp. Move it around.";
}

if (act === "Follow selected layer") {
    if (!byName(CTRL)) return "Apply Proximity to some layers first, then select the layer that should drive it.";
    var src2 = targets(false), made = 0;
    if (!src2.length) return "Select the layer the effector should follow (a mouse, a ball, a light...).";
    for (var f = 0; f < src2.length; f++) {
        if (rigged(src2[f])) continue;   // a reacting layer cannot also drive the rig
        addEffector(src2[f].threeDLayer || any3D(), src2[f]); made++;
    }
    if (!made) return "That layer reacts to Proximity, so it cannot drive it. Select a different layer.";
    return "Effector now follows " + (made === 1 ? "\"" + src2[0].name + "\"" : made + " layers") + ".";
}

// Apply
var tg = targets(false);
if (!tg.length) return "Select the layers that should react, then press Apply.";
var looks = lookList(), look = looks.join(" + ");
controller(looks);
var has3 = false;
for (var h = 0; h < tg.length; h++) if (tg[h].threeDLayer) has3 = true;
if (!anyEff()) addEffector(has3, null);

var done = 0, notes = [];
for (var i = 0; i < tg.length; i++) {
    var l = tg[i];
    if (drivesEffector(l)) { notes.push(l.name + " drives an effector"); continue; }
    try {
        unrig(l);
        setExpr(sqSlider(l, "SQ Prox Weight", 0).property(1), X_WEIGHT);
        setExpr(tr(l).property("ADBE Scale"), X_SCALE);
        setExpr(tr(l).property("ADBE Opacity"), X_OPAC);
        setExpr(tr(l).property("ADBE Rotate Z"), X_ROT);
        setExpr(tr(l).property("ADBE Anchor Point"), X_PUSH);
        sqFx(l).addProperty("ADBE Gaussian Blur 2").name = "SQ Prox Blur";
        try { sqFx(l).property("SQ Prox Blur").property(3).setValue(1); } catch (e4) {}
        setExpr(sqFx(l).property("SQ Prox Blur").property(1), X_BLUR);
        sqFx(l).addProperty("ADBE Tint").name = "SQ Prox Color";
        setExpr(sqFx(l).property("SQ Prox Color").property(1), X_TINTC);
        setExpr(sqFx(l).property("SQ Prox Color").property(2), X_TINTC);
        setExpr(sqFx(l).property("SQ Prox Color").property(3), X_TINTA);
        done++;
    } catch (err) { notes.push(l.name + ": " + (err && err.message ? err.message : err)); }
}
if (!done) return "Nothing applied: " + notes.join("; ");
return look + " on " + done + " layer" + (done > 1 ? "s" : "") + ". Move \"" + EFF + "1\" over them." + (notes.length ? " (" + notes.join("; ") + ")" : "");
