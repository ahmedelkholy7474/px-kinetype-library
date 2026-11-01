if (!comp) return "Open a composition first.";
var ls = [];
for (var i = 0; i < layers.length; i++) {
    var L0 = layers[i];
    if (!L0.property("ADBE Effect Parade") || (L0 instanceof CameraLayer) || (L0 instanceof LightLayer)) continue;
    if (String(L0.name).indexOf("SQ Cylinder") === 0) continue;
    ls.push(L0);
}
if (ls.length < 2) return "Select 2 or more layers for the cylinder.";
var n = ls.length, wsum = 0;
for (var a = 0; a < n; a++) {
    var r = ls[a].sourceRectAtTime(comp.time, false), sc = ls[a].property("ADBE Transform Group").property("ADBE Scale").value;
    wsum += r.width * sc[0] / 100;
}
var R = params.radius > 0 ? params.radius : Math.max(250, (wsum / n) * n * 1.15 / (2 * Math.PI));
var k = 1, nm;
do { nm = "SQ Cylinder " + k; k++; } while ((function () { for (var q = 1; q <= comp.numLayers; q++) if (comp.layer(q).name === nm) return true; return false; })());
var c = comp.layers.addNull();
c.name = nm; c.threeDLayer = true; c.label = 10;
c.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2, R]);
c.property("ADBE Transform Group").property("ADBE Rotate X").setValue(params.tilt);
sqSlider(c, "SQ Cyl Radius", R);
sqSlider(c, "SQ Cyl Angle", 0);
sqSlider(c, "SQ Cyl Spin", params.spin);
sqSlider(c, "SQ Cyl Back Blur", params.blur);
sqSlider(c, "SQ Cyl Back Opacity", params.minOpacity);
sqSlider(c, "SQ Cyl Back Darken", params.darken);
sqSlider(c, "SQ Cyl Focus", params.focus);
sqCheckbox(c, "SQ Cyl Snap To Cards", params.snap);
sqSlider(c, "SQ Cyl Hold", params.hold);
sqSlider(c, "SQ Cyl Count", n);

// placement: Angle slider + Spin, or step card-to-card when Snap is on
var head = [
 "var C=parent, R=C.effect(\"SQ Cyl Radius\")(1), N=Math.max(C.effect(\"SQ Cyl Count\")(1),1);",
 "var sp=C.effect(\"SQ Cyl Spin\")(1), rot;",
 "if (C.effect(\"SQ Cyl Snap To Cards\")(1)==1 && sp!=0) {",
 "  var st=360/N, mv=st/Math.abs(sp), hd=Math.max(C.effect(\"SQ Cyl Hold\")(1),0), cy=mv+hd, t=Math.max(time-C.inPoint,0);",
 "  var idx=Math.floor(t/cy), u=Math.min((t-idx*cy)/Math.max(mv,0.001),1); u=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;",
 "  rot=(idx+u)*st*(sp>0?1:-1);",
 "} else rot=time*sp;",
 "var a=(C.effect(\"SQ Cyl Angle\")(1)+rot+"
].join("\n");

// depth: where this card really is, seen from the active camera (works with null rotation, camera moves, keyframes)
var depth = [
 "var C=parent, R=Math.max(C.effect(\"SQ Cyl Radius\")(1),1);",
 "var p=thisLayer.toWorld(thisLayer.anchorPoint), c=C.toWorld(C.anchorPoint), v=[0,0,1];",
 "try { var cam=thisComp.activeCamera; v=normalize(cam.toWorldVec([0,0,1])); } catch(e) {}",
 "var d=dot(sub(p,c),v)/R, f=clamp((d+1)/2,0,1);",                 // 0 = facing camera, 1 = far back
 "var F=clamp(C.effect(\"SQ Cyl Focus\")(1),0,100)/100, g=1-Math.pow(1-f, 1+F*5);"   // Focus: how fast the side cards fall off
].join("\n");

for (var j = 0; j < n; j++) {
    var l = ls[j], off = (j * 360 / n).toFixed(4);
    l.threeDLayer = true;
    l.parent = c;
    var T = l.property("ADBE Transform Group");
    var ang = head + off + ")*Math.PI/180;";
    T.property("ADBE Position").expression = ang + " [Math.sin(a)*R, 0, -Math.cos(a)*R];";
    T.property("ADBE Orientation").expression = ang + " lookAt([Math.sin(a)*R, 0, -Math.cos(a)*R], [0, 0, 0]);";
    T.property("ADBE Opacity").expression = depth + " value*(1 - g*(1-C.effect(\"SQ Cyl Back Opacity\")(1)/100));";
    sqRemoveFx(l, "SQ Cyl ");
    var b = sqFx(l).addProperty("ADBE Gaussian Blur 2"); b.name = "SQ Cyl Depth Blur";
    sqFx(l).property("SQ Cyl Depth Blur").property(1).expression = depth + " g*C.effect(\"SQ Cyl Back Blur\")(1);";
    try { sqFx(l).property("SQ Cyl Depth Blur").property(3).setValue(1); } catch (e) {}
    var s = sqFx(l).addProperty("ADBE Brightness & Contrast 2"); s.name = "SQ Cyl Depth Shade";
    sqFx(l).property("SQ Cyl Depth Shade").property(1).expression = depth + " -g*C.effect(\"SQ Cyl Back Darken\")(1);";
}
return "Cylinder with " + n + " cards. Depth, spin and snap live on \"" + nm + "\"";
