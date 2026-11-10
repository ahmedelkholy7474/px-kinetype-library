// Squeezy add-on: Squeezy Parallax v1 (original Squeezy code)
// Turns a stack of layers into a depth scene. A controller null drives a virtual camera and every layer
// shifts and scales by its own depth, with real perspective math (near layers move more than far ones).
//   2D (light): no camera, everything lives in Position / Scale expressions.
//   3D Camera:  layers go 3D at their depth (scale-compensated so nothing changes size at rest) and a camera moves.
// runs as function(params, comp, layers)
if (!comp) return "Open a composition first.";

var CTRL = "SQ Parallax Controller";
var CAM = "SQ Parallax Camera";
var DEP = "SQ Parallax Depth";
var BLR = "SQ Parallax Blur";
var MARK = "// SQ-PARALLAX";
var TOKEN = "[sq-parallax-2d]";          // written in the layer comment when Squeezy turned a 2D layer 3D
var act = String(params.action || "Apply");

function num(v, d) { v = parseFloat(String(v).replace(",", ".")); return isNaN(v) ? d : v; }
function flag(v, d) { if (v === undefined || v === null || v === "") return d; return v === true || v === 1 || v === "true" || v === "1"; }
function q(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function byName(n) { for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === n) return comp.layer(i); return null; }
function tr(l) { return l.property("ADBE Transform Group"); }
function isRig(l) { return l.name === CTRL || l.name === CAM; }
function rigged(l) { var f = sqFx(l); return !!(f && f.property(DEP)); }
function ours(p) { try { return String(p.expression).indexOf("SQ-PARALLAX") >= 0; } catch (e) { return false; } }
function foreign(p) { try { return p.expression !== "" && !ours(p); } catch (e) { return false; } }
function setExpr(p, e, notes, who) {
    if (!p) return false;
    try { p.expression = e; } catch (er) { notes.push(who + ": " + (er && er.message ? er.message : er)); return false; }
    try { if (p.expressionError) notes.push(who + ": " + p.expressionError); } catch (e2) {}
    return true;
}
function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

// ---------------- expressions ----------------
// Every layer sits at a distance z from the camera: depth 0 = the focal plane (D), depth 100 = D*(1+3*Spread).
// A camera move of X px moves the focal plane X px on screen; farther layers move D/z of that.
function head(mode3, self) {
    return [
        'var C=thisComp.layer("' + q(CTRL) + '"); var cv=function(n){ return C.effect(n)(1).value; };',
        mode3 ? (self ? 'var D=thisLayer.cameraOption.zoom;' : 'var D=thisComp.layer("' + q(CAM) + '").cameraOption.zoom;') : 'var D=1000;',
        'var SP=Math.max(cv("Depth Spread"),0)/100*3;',
        'var zOf=function(d){ return D*(1+SP*Math.min(Math.max(d,0),1)); };',
        'var zf=zOf(cv("Focus Depth")/100), orb=cv("Orbit")>0.5;',
        'var fl=cv("Float"), ph=2*Math.PI*time/Math.max(cv("Float Cycle"),0.1);',
        'var cx=cv("Camera X")+fl*Math.sin(ph), cy=cv("Camera Y")+fl*0.5*Math.sin(2*ph+1.3), pz=cv("Push")/100*D;',
        'var lim=function(c,zz){ return Math.min(c,zz-D*0.1); };'
    ].join("\n");
}
function layerHead(mode3) {
    return head(mode3, false) + "\n" + [
        'var dep=effect("' + q(DEP) + '")(1).value/100, z=zOf(dep);',
        'var c1=lim(pz,z), k=z/(z-c1), mm=D/(z-c1)-(orb?D/(zf-lim(pz,zf)):0), sx=-cx*mm, sy=-cy*mm;'
    ].join("\n");
}
function wrap(tag, code) { return MARK + " " + tag + "\nvar __r=value;\ntry{\n" + code + "\n}catch(err){ __r=value; }\n__r"; }

function posExpr(mode3) {
    return wrap("position", layerHead(mode3) + "\n" + (mode3 ? [
        'var Cx=thisComp.width/2, Cy=thisComp.height/2, q0=hasParent?parent.toWorld(value):value, qz=q0.length>2?q0[2]:0;',
        'var nx=Cx+(q0[0]-Cx)*z/D, ny=Cy+(q0[1]-Cy)*z/D, nz=qz+z-D;',
        'if(hasParent){ var o=parent.fromWorld([nx,ny,nz]); nx=o[0]; ny=o[1]; nz=o[2]; }',
        '__r=[nx,ny,nz];'
    ] : [
        'var Cx=thisComp.width/2, Cy=thisComp.height/2, q0=hasParent?parent.toWorld(value):value;',
        'var nx=Cx+(q0[0]-Cx)*k+sx, ny=Cy+(q0[1]-Cy)*k+sy;',
        'if(hasParent){ var o=parent.fromWorld([nx,ny,q0.length>2?q0[2]:0]); nx=o[0]; ny=o[1]; }',
        '__r=value.length>2?[nx,ny,value[2]]:[nx,ny];'
    ]).join("\n"));
}

// Fill Edges: a layer that covers the frame gets just enough extra scale so its edges never show,
// measured from the controller's keyframes (so it stays right when you change the move).
function sclExpr(mode3) {
    return wrap("scale", layerHead(mode3) + "\n" + [
        'var F=1;',
        'if(cv("Fill Edges")>0.5){',
        ' var r=sourceRectAtTime(inPoint,false), w0=r.width*Math.abs(value[0])/100, h0=r.height*Math.abs(value[1])/100, W=thisComp.width, H=thisComp.height;',
        ' if(w0>=W*0.98 && h0>=H*0.98){',
        '  var ext=function(n,lo){ var p=C.effect(n)(1), a=p.value; for(var i=1;i<=p.numKeys;i++){ var v=p.key(i).value; a=lo?Math.min(a,v):Math.max(a,v); } return a; };',
        '  var ax=Math.max(Math.abs(ext("Camera X",1)),Math.abs(ext("Camera X",0)))+Math.abs(fl), ay=Math.max(Math.abs(ext("Camera Y",1)),Math.abs(ext("Camera Y",0)))+Math.abs(fl)*0.5;',
        '  var cs=[ext("Push",1)/100*D,0,ext("Push",0)/100*D];',
        '  for(var j=0;j<3;j++){ var cc=lim(cs[j],z), kk=z/(z-cc), m2=Math.abs(D/(z-cc)-(orb?D/(zf-lim(cs[j],zf)):0));',
        '   F=Math.max(F,(W+2*ax*m2)/(w0*kk),(H+2*ay*m2)/(h0*kk)); }',
        '  if(F>1) F*=' + (mode3 ? '1.03' : '1.01') + ';',
        ' }',
        '}',
        'var s=' + (mode3 ? 'z/D*F' : 'k*F') + ';',
        '__r=value.length>2?[value[0]*s,value[1]*s,value[2]*s]:[value[0]*s,value[1]*s];'
    ].join("\n"));
}

function blurExpr() {
    return wrap("blur", [
        'var C=thisComp.layer("' + q(CTRL) + '");',
        '__r=Math.max(0,C.effect("Depth Blur")(1).value*Math.abs(effect("' + q(DEP) + '")(1).value-C.effect("Focus Depth")(1).value)/100);'
    ].join("\n"));
}

function camPosExpr() {
    return wrap("camera", head(true, true) + "\n" + '__r=[value[0]+cx, value[1]+cy, -D+pz];');
}
function camPoiExpr() {
    return wrap("camera poi", head(true, true) + "\n" + [
        'var P=transform.position;',
        '__r=orb ? [thisComp.width/2, thisComp.height/2, zf-D] : [P[0], P[1], P[2]+D];'
    ].join("\n"));
}

// ---------------- controller ----------------
function controller() {
    var c = byName(CTRL), fresh = false;
    if (!c) {
        c = comp.layers.addNull(comp.duration);
        c.name = CTRL; c.label = 9; fresh = true;
        try { tr(c).property("ADBE Position").setValue([80, 80]); } catch (e) {}
    }
    var L = [
        ["Camera X", "s", 0], ["Camera Y", "s", 0], ["Push", "s", 0],
        ["Orbit", "c", 0], ["Float", "s", 0], ["Float Cycle", "s", 6],
        ["Depth Spread", "s", 100], ["Focus Depth", "s", 50], ["Depth Blur", "s", 0], ["Fill Edges", "c", 1]
    ];
    for (var i = 0; i < L.length; i++) {
        if (sqFx(c).property(L[i][0])) continue;
        if (L[i][1] === "s") sqSlider(c, L[i][0], L[i][2]); else sqCheckbox(c, L[i][0], L[i][2]);
    }
    c.moveToBeginning();
    return c;
}
function ctl(c, n) { return sqFx(c).property(n).property(1); }
function setCtl(c, n, v) { var p = ctl(c, n); while (p.numKeys > 0) p.removeKey(1); p.setValue(v); }
function modeOf(c) { return String(c.comment).indexOf("mode:3D") >= 0; }

// ---------------- camera ----------------
function camera(notes) {
    var cam = byName(CAM);
    if (!cam) cam = comp.layers.addCamera(CAM, [comp.width / 2, comp.height / 2]);
    var D = Math.round(comp.width * 50 / 36);                    // a 50mm lens
    try { cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(D); } catch (e) {}
    try { tr(cam).property("ADBE Position").setValue([comp.width / 2, comp.height / 2, -D]); } catch (e1) {}
    try { tr(cam).property("ADBE Anchor Point").setValue([comp.width / 2, comp.height / 2, 0]); } catch (e2) {}
    setExpr(tr(cam).property("ADBE Position"), camPosExpr(), notes, CAM);
    setExpr(tr(cam).property("ADBE Anchor Point"), camPoiExpr(), notes, CAM);
    cam.moveToBeginning();                                         // topmost camera = the active one
    return cam;
}
function dropCamera() { var cam = byName(CAM); if (cam) cam.remove(); }

// ---------------- motion ----------------
function motionPlan(m, A, P) {
    var h = A / 2;
    switch (m) {
        case "Push In":     return { p: [0, P] };
        case "Pull Out":    return { p: [P, 0] };
        case "Pan Left":    return { x: [h, -h] };
        case "Pan Right":   return { x: [-h, h] };
        case "Rise":        return { y: [h, -h] };
        case "Descend":     return { y: [-h, h] };
        case "Orbit Left":  return { x: [h, -h], orbit: 1 };
        case "Orbit Right": return { x: [-h, h], orbit: 1 };
        case "Drift In":    return { p: [0, P], x: [-A / 4, A / 4] };
        case "Float (loop)": return { float: A / 4 };
    }
    return {};
}
function motion(c) {
    var m = String(params.motion || "Push In");
    var A = num(params.travel, 200), P = num(params.push, 25), T = Math.max(0.1, num(params.duration, 5));
    var smooth = flag(params.smooth, true), t0 = comp.time, t1 = t0 + T;
    var plan = motionPlan(m, A, P);
    setCtl(c, "Camera X", 0); setCtl(c, "Camera Y", 0); setCtl(c, "Push", 0);
    setCtl(c, "Orbit", plan.orbit ? 1 : 0); setCtl(c, "Float", plan.float || 0);
    var map = { x: "Camera X", y: "Camera Y", p: "Push" };
    for (var k in map) {
        if (!map.hasOwnProperty(k) || !plan[k]) continue;
        var pr = ctl(c, map[k]);
        pr.setValueAtTime(t0, plan[k][0]);
        pr.setValueAtTime(t1, plan[k][1]);
        for (var i = 1; i <= pr.numKeys; i++) {
            if (smooth) {
                var e = [new KeyframeEase(0, 66)];
                try { pr.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER); pr.setTemporalEaseAtKey(i, e, e); } catch (er) {}
            } else {
                try { pr.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR); } catch (er2) {}
            }
        }
    }
    return m;
}

// ---------------- layers ----------------
function unrig(l, back2D) {
    var t = tr(l), n = 0, ps = [t.property("ADBE Position"), t.property("ADBE Scale")];
    for (var i = 0; i < ps.length; i++) if (ps[i] && ours(ps[i])) { ps[i].expression = ""; n++; }
    var fx = sqFx(l);
    if (fx) for (var j = fx.numProperties; j >= 1; j--) if (String(sqFx(l).property(j).name).indexOf("SQ Parallax") === 0) { sqFx(l).property(j).remove(); n++; }
    if (back2D) {
        var cm = String(l.comment);
        if (cm.indexOf(TOKEN) >= 0) {
            try { l.threeDLayer = false; } catch (e) {}
            try { l.comment = trim(cm.replace(TOKEN, "")); } catch (e1) {}
            n++;
        }
    }
    return n;
}
function blocked(l) {
    var t = tr(l), P = t.property("ADBE Position");
    var list = [P, t.property("ADBE Scale")];
    try { if (P.dimensionsSeparated) list.push(t.property("ADBE Position_0"), t.property("ADBE Position_1")); } catch (e) {}
    for (var i = 0; i < list.length; i++) if (list[i] && foreign(list[i])) return true;
    return false;
}
function rig(l, depth, mode3, blurOn, notes) {
    var P = tr(l).property("ADBE Position");
    try { if (P.dimensionsSeparated) P.dimensionsSeparated = false; } catch (e) {}
    if (mode3 && !l.threeDLayer) {
        l.threeDLayer = true;
        try { l.comment = trim(String(l.comment) + " " + TOKEN); } catch (e1) {}
    }
    sqSlider(l, DEP, Math.round(depth * 10) / 10);
    setExpr(tr(l).property("ADBE Position"), posExpr(mode3), notes, l.name);
    setExpr(tr(l).property("ADBE Scale"), sclExpr(mode3), notes, l.name);
    if (blurOn) {
        sqFx(l).addProperty("ADBE Gaussian Blur 2").name = BLR;
        try { sqFx(l).property(BLR).property(3).setValue(1); } catch (e2) {}   // repeat edge pixels
        setExpr(sqFx(l).property(BLR).property(1), blurExpr(), notes, l.name);
    }
}
function usable(l) {
    if (isRig(l) || sqIsCamOrLight(l) || !tr(l)) return false;
    try { if (!l.hasVideo) return false; } catch (e) {}
    return true;
}
function allRigged() { var out = []; for (var i = 1; i <= comp.numLayers; i++) if (rigged(comp.layer(i))) out.push(comp.layer(i)); return out; }

// ---------------- actions ----------------
if (act === "Remove") {
    var list = [];
    for (var a = 0; a < layers.length; a++) if (rigged(layers[a])) list.push(layers[a]);
    if (!list.length) list = allRigged();
    var cleaned = 0;
    for (var r = 0; r < list.length; r++) if (unrig(list[r], true)) cleaned++;
    var gone = false;
    if (!allRigged().length) {
        var c0 = byName(CTRL); if (c0) { c0.remove(); gone = true; }
        var k0 = byName(CAM); if (k0) { k0.remove(); gone = true; }
    }
    if (!cleaned && !gone) return "No Parallax found here.";
    return "Parallax removed" + (cleaned ? " from " + plural(cleaned, "layer") : "") + (gone ? ", controller deleted" : "") + ".";
}

if (act === "Change motion") {
    var cc = byName(CTRL);
    if (!cc) return "Apply Parallax to some layers first.";
    var mm = motion(cc);
    return mm + " set on \"" + CTRL + "\" from the playhead.";
}

// Apply
var mode3 = String(params.mode || "").indexOf("3D") >= 0;
var notes = [], tg = [];
for (var s = 0; s < layers.length; s++) if (usable(layers[s])) tg.push(layers[s]);
if (!tg.length) return "Select the layers of your scene (background, middle, foreground...), then press Apply.";
if (!byName(CTRL) && tg.length < 2) return "Select 2 or more layers: each one becomes a depth plane.";

// a layer parented to another selected layer already follows it
var keep = [];
for (var p = 0; p < tg.length; p++) {
    var par = tg[p].parent, inSel = false;
    for (var p2 = 0; par && p2 < tg.length; p2++) if (tg[p2].index === par.index) inSel = true;
    if (inSel) notes.push(tg[p].name + " follows its parent"); else keep.push(tg[p]);
}
tg = keep;
for (var b = tg.length - 1; b >= 0; b--) if (blocked(tg[b])) { notes.push(tg[b].name + " has its own Position/Scale expression"); tg.splice(b, 1); }
if (!tg.length) return "Nothing applied: " + notes.join("; ");

// depth from stacking order: top layer = closest (0), bottom = farthest (100)
tg.sort(function (x, y) { return x.index - y.index; });
var order = String(params.order || "Top layer = closest"), n = tg.length, work = [];
for (var d = 0; d < n; d++) {
    var auto = n > 1 ? d / (n - 1) * 100 : 0;
    if (order === "Bottom layer = closest") auto = 100 - auto;
    if (order === "Keep current" && rigged(tg[d])) { try { auto = sqFx(tg[d]).property(DEP).property(1).value; } catch (e0) {} }
    work.push({ l: tg[d], d: auto });
}

var hadCtrl = !!byName(CTRL);
var c = controller();
var oldMode = hadCtrl ? modeOf(c) : mode3;
try { c.comment = "SQ-PARALLAX mode:" + (mode3 ? "3D" : "2D"); } catch (ec) {}
setCtl(c, "Depth Spread", num(params.depth, 100));
setCtl(c, "Focus Depth", num(params.focus, 50));
setCtl(c, "Depth Blur", num(params.blur, 0));
setCtl(c, "Fill Edges", flag(params.fill, true) ? 1 : 0);
if (mode3) camera(notes); else dropCamera();

// switching 2D <-> 3D re-rigs the layers already in the scene too, keeping their depth
if (hadCtrl && oldMode !== mode3) {
    var old = allRigged();
    for (var o = 0; o < old.length; o++) {
        var seen = false;
        for (var w = 0; w < work.length; w++) if (work[w].l.index === old[o].index) seen = true;
        if (seen) continue;
        var od = 50; try { od = sqFx(old[o]).property(DEP).property(1).value; } catch (e1) {}
        work.push({ l: old[o], d: od });
    }
}

var blurWanted = num(params.blur, 0) > 0, done = 0;
for (var i = 0; i < work.length; i++) {
    var l = work[i].l;
    try {
        var hadBlur = !!(sqFx(l) && sqFx(l).property(BLR));
        unrig(l, !mode3);
        rig(l, work[i].d, mode3, blurWanted || hadBlur, notes);
        done++;
    } catch (err) { notes.push(l.name + ": " + (err && err.message ? err.message : err)); }
}
if (!done) return "Nothing applied: " + notes.join("; ");
c.moveToBeginning();
if (mode3) byName(CAM).moveToBeginning();
var mv = motion(c);
return mv + " parallax on " + plural(done, "layer") + (mode3 ? " with a 3D camera" : "") +
    ". Tweak the move on \"" + CTRL + "\"; each layer's \"" + DEP + "\" is its distance (0 = front, 100 = back)." +
    (notes.length ? " (" + notes.join("; ") + ")" : "");
