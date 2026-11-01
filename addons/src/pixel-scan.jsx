// Squeezy add-on: Pixel Scan Reveal (ported from PixelScan_Reveal v1.0 by Kholy)
// runs as function(params, comp, layers)
var SCRIPT_NAME = "Pixel Scan Reveal";
var VERSION = "1.0";
var TAG = "PixelScanRig";
var FOLDER_NAME = "PixelScan Precomps";

// ------------------------------------------------------------------
//  Small helpers
// ------------------------------------------------------------------

function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function trimStr(s) {
    return String(s).replace(/^\s+|\s+$/g, "");
}

function shortName(s) {
    s = trimStr(String(s));
    if (s.length > 24) { s = s.substring(0, 24); }
    return s;
}

function makeId() {
    var chars = "abcdefghjkmnpqrstuvwxyz23456789";
    var out = "";
    for (var i = 0; i < 4; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}

function tagString(id, role) {
    return TAG + ":" + id + ":" + role;
}

function readTag(str) {
    var m = String(str || "").match(/PixelScanRig:([a-z0-9]+):([a-zA-Z]+)/);
    if (!m) { return null; }
    return { id: m[1], role: m[2] };
}

// Find a property by a list of names / matchNames (direct first, then deep search)
function findProp(group, keys) {
    if (!group) { return null; }
    var i, p;
    for (i = 0; i < keys.length; i++) {
        try {
            p = group.property(keys[i]);
            if (p) { return p; }
        } catch (e) {}
    }
    for (i = 0; i < keys.length; i++) {
        p = deepFind(group, keys[i], 0);
        if (p) { return p; }
    }
    return null;
}

function deepFind(group, key, depth) {
    if (depth > 4) { return null; }
    var n = 0;
    try { n = group.numProperties; } catch (e) { return null; }
    for (var i = 1; i <= n; i++) {
        var p = null;
        try { p = group.property(i); } catch (e2) { p = null; }
        if (!p) { continue; }
        if (p.name === key || p.matchName === key) { return p; }
        if (p.propertyType === PropertyType.NAMED_GROUP || p.propertyType === PropertyType.INDEXED_GROUP) {
            var r = deepFind(p, key, depth + 1);
            if (r) { return r; }
        }
    }
    return null;
}

function setVal(group, keys, v) {
    var p = findProp(group, keys);
    if (!p) { return false; }
    try { p.setValue(v); return true; } catch (e) { return false; }
}

function setExpr(group, keys, expr) {
    var p = findProp(group, keys);
    if (!p) { return false; }
    try { p.expression = expr; return true; } catch (e) { return false; }
}

function setColor(prop, rgb) {
    if (!prop) { return; }
    try { prop.setValue([rgb[0], rgb[1], rgb[2], 1]); }
    catch (e) {
        try { prop.setValue([rgb[0], rgb[1], rgb[2]]); } catch (e2) {}
    }
}

function addFx(layer, matchName, name) {
    var parade = layer.property("ADBE Effect Parade");
    if (!parade.canAddProperty(matchName)) { return null; }
    var fx = parade.addProperty(matchName);
    if (name) {
        try { fx.name = name; } catch (e) {}
    }
    return fx;
}

function addCtrl(layer, type, name, value) {
    var matchName = {
        slider:   "ADBE Slider Control",
        angle:    "ADBE Angle Control",
        color:    "ADBE Color Control",
        checkbox: "ADBE Checkbox Control"
    }[type];
    var fx = addFx(layer, matchName, name);
    if (!fx) { return; }
    if (type === "color") { setColor(fx.property(1), value); }
    else { try { fx.property(1).setValue(value); } catch (e) {} }
}

function hexToRgb(hex) {
    hex = String(hex).replace(/[^0-9a-fA-F]/g, "");
    if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    if (hex.length !== 6) { return null; }
    var n = parseInt(hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function intToHex(n) {
    var s = (n & 0xFFFFFF).toString(16).toUpperCase();
    while (s.length < 6) { s = "0" + s; }
    return "#" + s;
}

function getFolder() {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FolderItem && it.name === FOLDER_NAME) { return it; }
    }
    return app.project.items.addFolder(FOLDER_NAME);
}

function hasTrackMatteSafe(layer) {
    try { return layer.hasTrackMatte === true; } catch (e) { return false; }
}

function setMatte(layer, matte) {
    if (typeof layer.setTrackMatte === "function") {
        // AE 2023+ : matte can be anywhere in the stack
        layer.setTrackMatte(matte, TrackMatteType.ALPHA);
        try { matte.enabled = false; } catch (e) {}
    } else {
        // Legacy: matte must sit directly above
        matte.moveBefore(layer);
        layer.trackMatteType = TrackMatteType.ALPHA;
    }
}

// ------------------------------------------------------------------
//  Expressions
// ------------------------------------------------------------------

// Position of the wipe group (moves the frontier along the chosen direction)
function exprFrontierPos(ref) {
    return [
        "var C = " + ref + ";",
        "var p = C.effect(\"Progress\")(1);",
        "var d = degreesToRadians(C.effect(\"Direction\")(1));",
        "var u = [Math.sin(d), -Math.cos(d)];",
        "var w = thisComp.width, h = thisComp.height;",
        "var E = (w * Math.abs(u[0]) + h * Math.abs(u[1])) / 2;",
        "var M = Math.abs(C.effect(\"Distortion\")(1)) * 0.5 + Math.abs(C.effect(\"Block Size\")(1)) + Math.abs(C.effect(\"Scan Width\")(1)) * 0.5;",
        "var s = linear(p, 0, 100, -E - M, E + M);",
        "[u[0] * s, u[1] * s];"
    ].join("\n");
}

function exprRotation(ref) {
    return ref + ".effect(\"Direction\")(1) - 90;";
}

function exprBandSize(ref, big) {
    return "[Math.max(1, " + ref + ".effect(\"Scan Width\")(1)), " + big + "];";
}

function exprBlocks(ref, axis) {
    var dim = (axis === "h") ? "thisComp.width" : "thisComp.height";
    return "Math.max(1, Math.round(" + dim + " / Math.max(2, " + ref + ".effect(\"Block Size\")(1))));";
}

// ------------------------------------------------------------------
//  Builders
// ------------------------------------------------------------------

// Comp-aligned shape layer holding one rectangle inside a group "Wipe".
// rectSize may be an array or an expression string.
function makeRectShape(comp, name, rectSize, rectPos) {
    var sl = comp.layers.addShape();
    sl.name = name;
    var tr = sl.property("ADBE Transform Group");
    tr.property("ADBE Anchor Point").setValue([0, 0]);
    tr.property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);

    sl.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    var grp = sl.property("ADBE Root Vectors Group").property(1);
    grp.name = "Wipe";

    grp.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");
    var rect = sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(1);
    rect.property("ADBE Vector Rect Position").setValue(rectPos);
    if (typeof rectSize === "string") {
        rect.property("ADBE Vector Rect Size").expression = rectSize;
    } else {
        rect.property("ADBE Vector Rect Size").setValue(rectSize);
    }

    sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");
    var fill = sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vectors Group").property(2);
    setColor(fill.property("ADBE Vector Fill Color"), [1, 1, 1]);

    return sl;
}

function wireWipe(sl, ref) {
    var gtr = sl.property("ADBE Root Vectors Group").property(1).property("ADBE Vector Transform Group");
    gtr.property("ADBE Vector Position").expression = exprFrontierPos(ref);
    gtr.property("ADBE Vector Rotation").expression = exprRotation(ref);
}

// Turbulent Displace + Mosaic: the jagged pixel edge (same settings on both mattes
// so the scan strip sits exactly on the reveal frontier)
function addMatteFx(sl, ref) {
    var td = addFx(sl, "ADBE Turbulent Displace", "PS Turbulence");
    if (td) {
        setExpr(td, ["Amount", "ADBE Turbulent Displace-0002"], ref + ".effect(\"Distortion\")(1);");
        setExpr(td, ["Size", "ADBE Turbulent Displace-0003"], ref + ".effect(\"Distortion Size\")(1);");
        setVal(td, ["Complexity", "ADBE Turbulent Displace-0005"], 8);
        setExpr(td, ["Evolution", "ADBE Turbulent Displace-0006"], ref + ".effect(\"Evolution\")(1);");
    }
    var mo = addFx(sl, "ADBE Mosaic", "PS Mosaic");
    if (mo) {
        setExpr(mo, ["Horizontal Blocks", "ADBE Mosaic-0001"], exprBlocks(ref, "h"));
        setExpr(mo, ["Vertical Blocks", "ADBE Mosaic-0002"], exprBlocks(ref, "v"));
        setExpr(mo, ["Sharp Colors", "ADBE Mosaic-0003"], ref + ".effect(\"Sharp Blocks\")(1);");
    }
}

function buildController(comp, name, id, o) {
    var ctrl = comp.layers.addNull(comp.duration);
    ctrl.name = name;
    ctrl.comment = tagString(id, "ctrl");
    try { ctrl.label = 2; } catch (e) {}

    addCtrl(ctrl, "slider",   "Progress",        o.out ? 100 : 0);
    addCtrl(ctrl, "angle",    "Direction",       o.direction);
    addCtrl(ctrl, "slider",   "Block Size",      o.blockSize);
    addCtrl(ctrl, "slider",   "Scan Width",      o.scanWidth);
    addCtrl(ctrl, "slider",   "Distortion",      200);
    addCtrl(ctrl, "slider",   "Distortion Size", 80);
    addCtrl(ctrl, "angle",    "Evolution",       0);
    addCtrl(ctrl, "checkbox", "Sharp Blocks",    0);
    addCtrl(ctrl, "color",    "Scan Color",      o.color);
    addCtrl(ctrl, "slider",   "Rainbow",         o.rainbow);
    addCtrl(ctrl, "angle",    "Hue Shift",       0);
    addCtrl(ctrl, "slider",   "Smear",           200);
    addCtrl(ctrl, "slider",   "Glass Depth",     200);
    addCtrl(ctrl, "slider",   "Glow Intensity",  100);
    addCtrl(ctrl, "slider",   "Glow Size",       100);
    addCtrl(ctrl, "slider",   "Scan Opacity",    100);

    // Animate Progress from the current time
    var prog = ctrl.property("ADBE Effect Parade").property("Progress").property(1);
    var t0 = comp.time;
    var t1 = t0 + Math.max(comp.frameDuration, o.duration);
    prog.setValueAtTime(t0, o.out ? 100 : 0);
    prog.setValueAtTime(t1, o.out ? 0 : 100);
    try {
        var easeIn = new KeyframeEase(0, o.ease);
        var easeOut = new KeyframeEase(0, o.ease);
        prog.setTemporalEaseAtKey(1, [easeIn], [easeOut]);
        prog.setTemporalEaseAtKey(2, [easeIn], [easeOut]);
    } catch (e2) {}

    return ctrl;
}

// Effects on the scan layer (look: glass bevel, horizontal smear, color, glow)
function addScanLook(scan, mapIndex, ref) {
    var g = addFx(scan, "CC Glass", "PS Glass");
    if (g) {
        setVal(g, ["Bump Map"], mapIndex);
        setVal(g, ["Softness"], 1);
        setVal(g, ["Height"], -50);
        setExpr(g, ["Displacement"], ref + ".effect(\"Glass Depth\")(1);");
        setVal(g, ["Ambient"], 50);
        setVal(g, ["Diffuse"], 50);
        setVal(g, ["Specular"], 50);
        setVal(g, ["Roughness"], 0.025);
        setVal(g, ["Metal"], 100);
    }

    var smears = [["PS Smear A", ".effect(\"Smear\")(1) * 0.5;"], ["PS Smear B", ".effect(\"Smear\")(1) * -1;"]];
    for (var s = 0; s < smears.length; s++) {
        var dm = addFx(scan, "ADBE Displacement Map", smears[s][0]);
        if (dm) {
            setVal(dm, ["Displacement Map Layer", "ADBE Displacement Map-0001"], mapIndex);
            setExpr(dm, ["Max Horizontal Displacement", "ADBE Displacement Map-0003"], ref + smears[s][1]);
            setVal(dm, ["Max Vertical Displacement", "ADBE Displacement Map-0005"], 0);
            setVal(dm, ["Expand Output"], 1);
        }
    }

    var cr = addFx(scan, "APC Colorama", "PS Rainbow");
    if (cr) {
        setExpr(cr, ["Phase Shift"], ref + ".effect(\"Hue Shift\")(1);");
        setExpr(cr, ["Blend With Original"], "100 - clamp(" + ref + ".effect(\"Rainbow\")(1), 0, 100);");
    }

    var glows = [[12, 1.4], [45, 1.0], [140, 0.6]];
    for (var i = 0; i < glows.length; i++) {
        var gl = addFx(scan, "ADBE Glo2", "PS Glow " + (i + 1));
        if (gl) {
            setVal(gl, ["Glow Threshold", "ADBE Glo2-0002"], 35);
            setExpr(gl, ["Glow Radius", "ADBE Glo2-0003"], glows[i][0] + " * " + ref + ".effect(\"Glow Size\")(1) / 100;");
            setExpr(gl, ["Glow Intensity", "ADBE Glo2-0004"], glows[i][1] + " * " + ref + ".effect(\"Glow Intensity\")(1) / 100;");
        }
    }

    scan.property("ADBE Transform Group").property("ADBE Opacity").expression =
        "clamp(" + ref + ".effect(\"Scan Opacity\")(1), 0, 100);";
}

// ------------------------------------------------------------------
//  Main: build the rig on one layer
// ------------------------------------------------------------------

function applyToLayer(comp, L, o) {
    var id = makeId();
    var base = shortName(L.name);
    var ctrlName = "PixelScan CTRL - " + base + " #" + id;
    var refLocal = "thisComp.layer(\"" + esc(ctrlName) + "\")";
    var refRemote = "comp(\"" + esc(comp.name) + "\").layer(\"" + esc(ctrlName) + "\")";
    var big = Math.round(Math.max(comp.width, comp.height) * 4);

    // 1) Controller null
    var ctrl = buildController(comp, ctrlName, id, o);

    // 2) Scan source: duplicate of the layer + scan-band matte -> pre-comp
    var dup = L.duplicate();
    dup.name = "PS Scan Source";
    try { if (typeof dup.removeTrackMatte === "function" && hasTrackMatteSafe(dup)) { dup.removeTrackMatte(); } } catch (e0) {}

    var band = makeRectShape(comp, "PS Scan Band Matte", exprBandSize(refRemote, big), [0, 0]);
    band.moveBefore(dup);
    addMatteFx(band, refRemote);
    wireWipe(band, refRemote);

    var precompName = "PixelScan Scan - " + base + " #" + id;
    var pre = comp.layers.precompose([band.index, dup.index], precompName, true);
    pre.comment = tagString(id, "precomp");
    try { pre.parentFolder = getFolder(); } catch (e1) {}

    var pSrc = pre.layer("PS Scan Source");
    var pBand = pre.layer("PS Scan Band Matte");
    var fill = addFx(pSrc, "ADBE Fill", "PS Scan Fill");
    if (fill) { setExpr(fill, ["Color", "ADBE Fill-0002"], refRemote + ".effect(\"Scan Color\")(1);"); }
    setMatte(pSrc, pBand);
    pBand.comment = tagString(id, "band");

    var scan = null;
    for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).source === pre) { scan = comp.layer(i); break; }
    }
    if (!scan) { throw new Error("Could not find the scan pre-comp layer."); }
    scan.name = "PS Scan - " + base + " #" + id;
    scan.comment = tagString(id, "scan");

    var map = scan.duplicate();
    map.name = "PS Scan Map - " + base + " #" + id;
    map.comment = tagString(id, "map");
    map.enabled = false;
    try { map.shy = true; } catch (e2) {}

    // 3) Reveal matte for the original layer
    var reveal = makeRectShape(comp, "PS Reveal Matte - " + base + " #" + id, [big, big], [-big / 2, 0]);
    reveal.comment = tagString(id, "reveal");
    addMatteFx(reveal, refLocal);
    wireWipe(reveal, refLocal);
    try { reveal.shy = true; } catch (e3) {}

    // 4) Stack order (top -> bottom): CTRL, Scan, Map, Reveal Matte, Layer
    reveal.moveBefore(L);
    map.moveBefore(reveal);
    scan.moveBefore(map);
    ctrl.moveBefore(scan);

    setMatte(L, reveal);

    // 5) Scan look (layer refs set after the final order)
    addScanLook(scan, map.index, refLocal);

    return ctrl;
}

// ------------------------------------------------------------------
//  Remove a rig
// ------------------------------------------------------------------

function removeRigs(comp, layers) {
    var ids = {};
    var count = 0;
    var i, t;
    for (i = 0; i < layers.length; i++) {
        t = readTag(layers[i].comment);
        if (!t) {
            try {
                if (hasTrackMatteSafe(layers[i]) && layers[i].trackMatteLayer) {
                    t = readTag(layers[i].trackMatteLayer.comment);
                }
            } catch (e) {}
        }
        if (t && !ids[t.id]) { ids[t.id] = true; count++; }
    }
    if (count === 0) { return 0; }

    for (i = comp.numLayers; i >= 1; i--) {
        t = readTag(comp.layer(i).comment);
        if (t && ids[t.id]) {
            try { comp.layer(i).locked = false; } catch (e1) {}
            comp.layer(i).remove();
        }
    }
    for (i = app.project.numItems; i >= 1; i--) {
        var it = app.project.item(i);
        if (it instanceof CompItem) {
            t = readTag(it.comment);
            if (t && ids[t.id] && it.usedIn.length === 0) { it.remove(); }
        }
    }
    for (i = app.project.numItems; i >= 1; i--) {
        var f = app.project.item(i);
        if (f instanceof FolderItem && f.name === FOLDER_NAME && f.numItems === 0) { f.remove(); }
    }
    return count;
}


// ------------------------------------------------------------------
//  Squeezy entry point
// ------------------------------------------------------------------
if (!comp) { return "Open a composition first."; }
if (!layers.length) { return "Select the layer(s) to reveal (or a Pixel Scan rig to remove)."; }

if (params.action === "Remove rig") {
    var nr = removeRigs(comp, layers);
    return nr ? "Removed " + nr + " Pixel Scan rig" + (nr > 1 ? "s" : "") : "No Pixel Scan rig found on the selected layers.";
}

var DIRS = { "Left → Right": 90, "Right → Left": 270, "Top → Bottom": 180, "Bottom → Top": 0 };
var dirAngle = DIRS[params.direction]; if (dirAngle === undefined) { dirAngle = 90; }
var isOut = params.mode === "Reveal Out";
if (isOut) { dirAngle = (dirAngle + 180) % 360; }
var opts = {
    direction: dirAngle,
    out: isOut,
    duration: Math.max(0.05, +params.duration || 1.5),
    blockSize: Math.max(2, +params.blockSize || 40),
    scanWidth: Math.max(1, +params.scanWidth || 180),
    rainbow: Math.max(0, Math.min(100, +params.rainbow || 0)),
    color: hexToRgb(params.color) || [0.18, 0.95, 1],
    ease: params.ease ? 45 : 0.1
};

var targets = [], skipped = [], ctrls = [], errors = [], i;
for (i = 0; i < layers.length; i++) {
    var L = layers[i];
    if (L instanceof CameraLayer || L instanceof LightLayer) { skipped.push(L.name); continue; }
    if (readTag(L.comment)) { skipped.push(L.name + " (already a rig)"); continue; }
    if (hasTrackMatteSafe(L)) { skipped.push(L.name + " (has a track matte, precompose it)"); continue; }
    if (L.parent) { skipped.push(L.name + " (parented, precompose it)"); continue; }
    targets.push(L);
}
if (!targets.length) { return "Nothing to apply. Skipped: " + skipped.join(", "); }
for (i = 0; i < targets.length; i++) {
    try { ctrls.push(applyToLayer(comp, targets[i], opts)); }
    catch (err) { errors.push(targets[i].name + ": " + err.toString() + (err.line ? " (line " + err.line + ")" : "")); }
}
for (i = 1; i <= comp.numLayers; i++) { comp.layer(i).selected = false; }
for (i = 0; i < ctrls.length; i++) { ctrls[i].selected = true; }
if (errors.length) { throw new Error(errors.join(" | ")); }
return "Pixel Scan on " + ctrls.length + " layer" + (ctrls.length > 1 ? "s" : "") + ". Tweak it on the \"PixelScan CTRL\" null"
    + (skipped.length ? " (skipped: " + skipped.join(", ") + ")" : "");
