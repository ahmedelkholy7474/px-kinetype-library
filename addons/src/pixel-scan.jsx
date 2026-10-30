if (!comp) return "Open a composition first.";
if (!layers.length) return "Select the layer to reveal.";
var COLORS = { "Cyan": "#3CC8F0", "White": "#FFFFFF", "Purple": "#8B6CFF", "Pink": "#FF4D9A", "Orange": "#FF8A1A", "Green": "#4BFF8A" };
var DIRS = { "Left → Right": "ltr", "Right → Left": "rtl", "Top → Bottom": "ttb", "Bottom → Top": "btt", "Center out": "center", "Random": "random" };
var n = 0;
for (var i = 0; i < layers.length; i++) {
    var l = layers[i];
    if (!l.property("ADBE Effect Parade") || String(l.name).indexOf("SQ Scan ") === 0) continue;
    sqScan(comp, l, { t0: comp.time, dur: params.duration, size: params.size, dir: DIRS[params.direction] || "ltr",
        random: params.random, band: params.band, color: COLORS[params.color] || "#3CC8F0", glow: params.glow });
    n++;
}
return n ? "Pixel Scan Reveal on " + n + " layer" + (n > 1 ? "s" : "") + ". Retime with the \"SQ Scan Progress\" keyframes" : "Nothing to reveal in the selection.";
