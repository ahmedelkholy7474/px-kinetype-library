if (!comp) return "Open a composition first.";
var ls = [];
for (var i = 0; i < layers.length; i++) if (layers[i].property("ADBE Effect Parade") && !(layers[i] instanceof CameraLayer) && !(layers[i] instanceof LightLayer)) ls.push(layers[i]);
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
sqSlider(c, "SQ Cyl Blur", params.blur);
sqSlider(c, "SQ Cyl Min Opacity", params.minOpacity);
var head = "var C=parent, R=C.effect(\"SQ Cyl Radius\")(1); var a=(C.effect(\"SQ Cyl Angle\")(1)+time*C.effect(\"SQ Cyl Spin\")(1)+";
for (var j = 0; j < n; j++) {
    var l = ls[j], off = (j * 360 / n).toFixed(4);
    l.threeDLayer = true;
    l.parent = c;
    var T = l.property("ADBE Transform Group");
    var ang = head + off + ")*Math.PI/180;";
    T.property("ADBE Position").expression = ang + " [Math.sin(a)*R, 0, -Math.cos(a)*R];";
    T.property("ADBE Orientation").expression = ang + " lookAt([Math.sin(a)*R, 0, -Math.cos(a)*R], [0, 0, 0]);";
    T.property("ADBE Opacity").expression = ang + " var f=(1-Math.cos(a))/2; 100 - f*(100-C.effect(\"SQ Cyl Min Opacity\")(1));";
    sqRemoveFx(l, "SQ Cyl ");
    var b = sqFx(l).addProperty("ADBE Gaussian Blur 2");
    b.name = "SQ Cyl Depth Blur";
    sqFx(l).property("SQ Cyl Depth Blur").property(1).expression = ang + " var f=(1-Math.cos(a))/2; f*C.effect(\"SQ Cyl Blur\")(1);";
    try { sqFx(l).property("SQ Cyl Depth Blur").property(3).setValue(1); } catch (e) {}
}
return "Cylinder with " + n + " layers. Spin, radius and blur live on \"" + nm + "\"";
