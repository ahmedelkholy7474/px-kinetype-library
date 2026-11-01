// ---- Squeezy Text Sync: subtitles file -> animated captions, each word on its own time ----
if (!comp) throw new Error("Open a composition first.");
var DOT = " · ";

if (params.action === "Remove captions") {
    var rm = 0;
    for (var r = comp.numLayers; r >= 1; r--) if (String(comp.layer(r).name).indexOf("SQ Sync" + DOT) === 0) { comp.layer(r).remove(); rm++; }
    if (!rm) throw new Error("No Text Sync captions in this comp.");
    return rm + " caption layer" + (rm === 1 ? "" : "s") + " removed";
}

// ---------- read the file ----------
function sqTime(s) {
    var p = String(s).replace(",", ".").split(":"), t = 0;
    for (var i = 0; i < p.length; i++) t = t * 60 + parseFloat(p[i]);
    return t;
}
function sqReadCues(f) {
    f.encoding = "UTF-8";
    if (!f.open("r")) throw new Error("Could not open " + f.displayName);
    var s = f.read(); f.close();
    s = s.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    var blocks = s.split(/\n[ \t]*\n/), cues = [];
    var re = /((?:\d+:)?\d+:\d+[,.]\d+)\s*-->\s*((?:\d+:)?\d+:\d+[,.]\d+)/;
    for (var b = 0; b < blocks.length; b++) {
        var lines = blocks[b].split("\n"), at = -1, m = null;
        for (var k = 0; k < lines.length; k++) { m = lines[k].match(re); if (m) { at = k; break; } }
        if (at < 0) continue;
        var txt = [];
        for (var q = at + 1; q < lines.length; q++) {
            var ln = lines[q].replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/^\s+|\s+$/g, "");
            if (ln) txt.push(ln);
        }
        if (!txt.length) continue;
        var t0 = sqTime(m[1]), t1 = sqTime(m[2]);
        if (t1 > t0) cues.push({ t0: t0, t1: t1, lines: txt });
    }
    return cues;
}

var isWin = $.os.indexOf("Windows") >= 0;
var file = File.openDialog("Choose a subtitles file (.srt or .vtt)", isWin ? "Subtitles:*.srt;*.vtt,All files:*.*" : function (f) {
    return typeof f.getFiles === "function" || /\.(srt|vtt|txt)$/i.test(f.name);
});
if (!file) return "Cancelled";
var cues = sqReadCues(file);
if (!cues.length) throw new Error("No timed lines found in " + decodeURI(file.name) + ". Use an .srt or .vtt file.");

// ---------- options ----------
var MODE = params.mode || "Words build up";          // Words build up | One word at a time | Whole line
var ANIM = params.animation || "Pop";                 // Pop | Fade up | Blur in | Typewriter
var PER = Math.round(params.perCaption || 0);         // 0 = keep the file's captions
var OFF = params.startAt === "Comp start" ? 0 : comp.time;
var SPEED = Math.max(params.speed || 6, 1) * comp.frameDuration;
var HL = !!params.highlight && MODE !== "One word at a time";
var template = null;
for (var s0 = 0; s0 < layers.length; s0++) if (layers[s0].property("ADBE Text Properties")) { template = layers[s0]; break; }

// ---------- words + timing (each word gets time in proportion to its length) ----------
function sqWords(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var ws = lines[i].split(/\s+/);
        for (var j = 0; j < ws.length; j++) if (ws[j]) out.push({ w: ws[j], line: i });
    }
    return out;
}
function sqTimeWords(ws, t0, t1) {
    var tot = 0, i;
    for (i = 0; i < ws.length; i++) tot += ws[i].w.length + 1;
    var acc = 0;
    for (i = 0; i < ws.length; i++) {
        ws[i].s = t0 + (t1 - t0) * acc / tot;
        acc += ws[i].w.length + 1;
        ws[i].e = t0 + (t1 - t0) * acc / tot;
    }
    return ws;
}
var caps = [];   // {t0, t1, words:[{w,line,s,e}]}
for (var c = 0; c < cues.length; c++) {
    var cw = sqTimeWords(sqWords(cues[c].lines), cues[c].t0 + OFF, cues[c].t1 + OFF);
    if (!cw.length) continue;
    if (MODE === "One word at a time") {
        for (var a = 0; a < cw.length; a++) caps.push({ t0: cw[a].s, t1: cw[a].e, words: [{ w: cw[a].w, line: 0, s: cw[a].s, e: cw[a].e }] });
    } else if (PER > 0) {
        for (var g = 0; g < cw.length; g += PER) {
            var part = cw.slice(g, g + PER);
            for (var pp = 0; pp < part.length; pp++) part[pp].line = 0;
            caps.push({ t0: part[0].s, t1: part[part.length - 1].e, words: part });
        }
    } else caps.push({ t0: cues[c].t0 + OFF, t1: cues[c].t1 + OFF, words: cw });
}

// ---------- layer building ----------
function sqText(ws) {
    var s = "", line = ws.length ? ws[0].line : 0;
    for (var i = 0; i < ws.length; i++) {
        if (i) s += ws[i].line !== line ? "\r" : " ";
        line = ws[i].line; s += ws[i].w;
    }
    return s;
}
function sqArr(a) { var o = []; for (var i = 0; i < a.length; i++) o.push(Math.round(a[i] * 1000) / 1000); return "[" + o.join(",") + "]"; }

function sqAnimator(L, name, props, basedOn, expr) {
    var G = function () { return L.property("ADBE Text Properties").property("ADBE Text Animators"); };
    var an = G().addProperty("ADBE Text Animator"), idx = an.propertyIndex;
    an.name = name;
    var A = function () { return G().property(idx); };
    var SL = function () { return A().property("ADBE Text Selectors"); };
    for (var s = SL().numProperties; s >= 1; s--) SL().property(s).remove();
    for (var i = 0; i < props.length; i++) {
        try { A().property("ADBE Text Animator Properties").addProperty(props[i][0]); } catch (e) {}
        try { A().property("ADBE Text Animator Properties").property(props[i][0]).setValue(props[i][1]); } catch (e1) {}
    }
    SL().addProperty("ADBE Text Expressible Selector");
    var sel = SL().property(SL().numProperties);
    try { sel.property("ADBE Text Range Type2").setValue(basedOn); } catch (e2) {}
    var amt = SL().property(SL().numProperties).property("ADBE Text Expressible Amount");
    var dim = 1; try { var v0 = amt.value; if (v0 instanceof Array) dim = v0.length; else if (v0 && v0.length) dim = v0.length; } catch (e3) {}
    var ret = "v"; if (dim > 1) { var r = []; for (var d = 0; d < dim; d++) r.push("v"); ret = "[" + r.join(",") + "]"; }
    amt.expression = expr + "\n" + ret + ";";
}

function sqStyle(L, text) {
    var tp = L.property("ADBE Text Properties").property("ADBE Text Document"), td = tp.value;
    if (template) {
        var t = template.property("ADBE Text Properties").property("ADBE Text Document").value;
        var keys = ["font", "fontSize", "applyFill", "fillColor", "applyStroke", "strokeColor", "strokeWidth", "strokeOverFill", "tracking", "leading", "fauxBold", "allCaps"];
        for (var k = 0; k < keys.length; k++) { try { td[keys[k]] = t[keys[k]]; } catch (ek) {} }
    }
    if (!template) {   // a selected text layer is the style; otherwise use the panel's font / size / colour
        if (params.font) { try { td.font = String(params.font); } catch (ef) {} }
        td.fontSize = params.size || 80;
        td.applyFill = true; td.fillColor = sqHex(params.color || "#FFFFFF").slice(0, 3);
    }
    if (params.outline > 0) { td.applyStroke = true; td.strokeColor = [0, 0, 0]; td.strokeWidth = params.outline; td.strokeOverFill = false; }
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    td.text = text;
    tp.setValue(td);
}

function sqPlace(L, t) {
    var tr = L.property("ADBE Transform Group");
    var r = L.sourceRectAtTime(t, false);
    if (r.width > comp.width * 0.9) {   // too wide for the frame: shrink to fit
        var tp = L.property("ADBE Text Properties").property("ADBE Text Document"), td = tp.value;
        td.fontSize = td.fontSize * comp.width * 0.9 / r.width; tp.setValue(td);
        r = L.sourceRectAtTime(t, false);
    }
    tr.property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
    var pos;
    if (params.position === "Like selected layer" && template) pos = template.property("ADBE Transform Group").property("ADBE Position").value;
    else if (params.position === "Top") pos = [comp.width / 2, comp.height * 0.16];
    else if (params.position === "Center") pos = [comp.width / 2, comp.height / 2];
    else pos = [comp.width / 2, comp.height * 0.84];
    try { tr.property("ADBE Position").setValue(pos); } catch (e) { tr.property("ADBE Position").setValue([pos[0], pos[1], 0]); }
}

var EASE = "function cl(x){return Math.min(Math.max(x,0),1);}\n" +
    "function oc(p){return 1-Math.pow(1-p,3);}\n" +
    "function bk(p){var c=1.9;return p<=0?0:(p>=1?1:1+(c+1)*Math.pow(p-1,3)+c*Math.pow(p-1,2));}\n";

var made = 0, typed = ANIM === "Typewriter";
for (var n = 0; n < caps.length; n++) {
    var cp = caps[n], txt = sqText(cp.words);
    var L = comp.layers.addText(txt);
    L.name = "SQ Sync" + DOT + (n + 1) + DOT + txt.replace(/\r/g, " ").substring(0, 24);
    sqStyle(L, txt);
    L.inPoint = cp.t0; L.outPoint = Math.max(cp.t1, cp.t0 + comp.frameDuration);
    sqPlace(L, cp.t0 + 0.01);
    try { L.property("ADBE Text Properties").property("ADBE Text More Options").property("ADBE Text Anchor Point Option").setValue(typed ? 1 : 2); } catch (eg) {}
    try { L.property("ADBE Text Properties").property("ADBE Text More Options").property("ADBE Text Anchor Point Align").setValue([0, -40]); } catch (eh) {}

    // start / end of every unit (a word, or a letter for Typewriter)
    var S = [], E = [], whole = MODE === "Whole line";
    for (var w = 0; w < cp.words.length; w++) {
        var wd = cp.words[w];
        if (typed) {
            var cs = wd.w.length;
            for (var ch = 0; ch < cs; ch++) { S.push(wd.s + (wd.e - wd.s) * 0.6 * ch / cs); E.push(wd.e); }
        } else { S.push(whole ? cp.t0 : wd.s); E.push(wd.e); }
    }
    var head = "var S=" + sqArr(S) + ", D=" + Math.round(SPEED * 1000) / 1000 + ";\nvar i=Math.min(Math.max(textIndex-1,0),S.length-1);\n" + EASE +
        "var p=cl((time-S[i])/D);\n";
    var basedOn = typed ? 2 : 3;
    var inProps = [["ADBE Text Opacity", 0]];
    if (ANIM === "Fade up") inProps.push(["ADBE Text Position 3D", [0, Math.round(L.property("ADBE Text Properties").property("ADBE Text Document").value.fontSize * 0.5), 0]]);
    if (ANIM === "Blur in") inProps.push(["ADBE Text Blur", [18, 18]]);
    sqAnimator(L, "SQ Sync" + DOT + "In", inProps, basedOn, head + (typed ? "var v=time>=S[i]?0:100;" : "var v=100*(1-oc(p));"));
    if (ANIM === "Pop") sqAnimator(L, "SQ Sync" + DOT + "Pop", [["ADBE Text Scale 3D", [0, 0, 100]]], basedOn, head + "var v=100*(1-bk(p));");
    if (HL && !typed) {
        sqAnimator(L, "SQ Sync" + DOT + "Highlight", [["ADBE Text Fill Color", sqHex(params.highlight || "#FFD23F")]], 3,
            "var S=" + sqArr(function () { var a = []; for (var q = 0; q < cp.words.length; q++) a.push(cp.words[q].s); return a; }()) + ", E=" + sqArr(E) + ";\n" +
            "var i=Math.min(Math.max(textIndex-1,0),S.length-1), f=0.06;\nvar v=100*Math.min(Math.min(Math.max((time-S[i])/f,0),1),Math.min(Math.max((E[i]-time)/f,0),1));");
    }
    made++;
}
for (var z = 1; z <= comp.numLayers; z++) comp.layer(z).selected = false;
return made + " caption" + (made === 1 ? "" : "s") + " from " + decodeURI(file.name) + (template ? " (style from " + template.name + ")" : "");
