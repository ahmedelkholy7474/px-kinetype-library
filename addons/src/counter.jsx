// Squeezy add-on: Squeezy Counter v2 (original Squeezy code)
// Shake-free number count in ONE text layer: text animators give every digit the same width. Commas, decimals,
// Arabic digits and symbols (% $ AED ...). runs as function(params, comp, layers)
var SQ_MSG = null, SQ_LAST = null;
function alert(m) { SQ_MSG = String(m); }      // the panel shows the returned text instead of pop-ups

var SCRIPT_NAME = "Squeezy Counter";
var BASE_NAME   = "Squeezy Counter";
var SLIDER_MAX  = 1000000;   // AE slider control hard limit

// ------------------------------------------------------------------
//  Expression building blocks
// ------------------------------------------------------------------
var FMT = [
    "function sqFmt(v,d,cm,from,ar){",
    "  d=Math.max(0,Math.min(4,Math.round(d)));",
    "  var p=Math.pow(10,d), neg=v<0;",
    "  var r=Math.round(Math.abs(v)*p)/p;",
    "  var s=r.toFixed(d), ip=s, fp='', k=s.indexOf('.');",
    "  if(k>=0){ip=s.substring(0,k);fp=s.substring(k);}",
    "  if(cm>0.5&&r>=from){var o='',n=0;for(var i=ip.length-1;i>=0;i--){o=ip.charAt(i)+o;n++;if(n%3==0&&i>0)o=','+o;}ip=o;}",
    "  s=((neg&&r>0)?'-':'')+ip+fp;",
    "  if(ar>0.5){var t='';for(var j=0;j<s.length;j++){var c=s.charCodeAt(j);t+=(c>=48&&c<=57)?String.fromCharCode(1632+c-48):s.charAt(j);}s=t;}",
    "  return s;",
    "}"
].join("\n");

function coreExpr(ctrlRef) {
    return [
        "var C=" + ctrlRef + ";",
        FMT,
        "function E(n,t){return C.effect(n)(1).valueAtTime(t);}",
        "function V(t){var a=E('Start',t),b=E('End',t),p=E('Progress',t)/100;return (a+(b-a)*p)*E('Multiplier',t);}",
        "function S(t){return sqFmt(V(t),E('Decimals',t),E('Commas',t),E('Comma From',t),E('Arabic Digits',t));}"
    ].join("\n");
}

var LAYOUT = [
    "var dw=C.effect('Digit Width')(1).value, sw=C.effect('Separator Width')(1).value, tr=C.effect('Tracking')(1).value;",
    "function cw(ch){return (ch==','||ch=='.')?sw:dw;}",
    "function totalW(s){var w=0;for(var j=0;j<s.length;j++)w+=cw(s.charAt(j));return w+tr*Math.max(0,s.length-1);}",
    // returns [offset of right edge, total width]  (glides when the digit count changes)
    "function LAY(){",
    "  var al=Math.round(C.effect('Align')(1).value), sm=Math.max(0,C.effect('Smooth Glide')(1).value), W;",
    "  if(sm>0&&al<3){var N=10,acc=0;for(var q=0;q<N;q++)acc+=totalW(S(time-sm*q/(N-1)));W=acc/N;}",
    "  else W=totalW(S(time));",
    "  return [al<=1?W:(al==2?W/2:0), W];",
    "}",
    "var ap=C.transform.anchorPoint;"
].join("\n");

function slotTextExpr(ctrlName, idx) {
    return coreExpr("thisComp.layer(" + q(ctrlName) + ")") + "\n" +
        "var IDX=" + idx + ";\n" +
        "var s=S(time), k=s.length-1-IDX;\n" +
        "k>=0 ? s.charAt(k) : '';";
}

function slotPosExpr(ctrlName, idx) {
    return coreExpr("thisComp.layer(" + q(ctrlName) + ")") + "\n" + LAYOUT + "\n" +
        "var IDX=" + idx + ";\n" +
        "var s=S(time), k=s.length-1-IDX, x=0;\n" +
        "if(k>=0){for(var j=s.length-1;j>k;j--)x-=cw(s.charAt(j))+tr; x-=cw(s.charAt(k))/2;}\n" +
        "var L=LAY();\n" +
        "[x+L[0]+ap[0], ap[1]];";
}

// ---------------- symbols ----------------
//  [ text, default side (1 = after the number), word (gets a space in Single mode) ]
var SYMBOLS = [
    ["None", "", 0, 0], ["%", "%", 1, 0], ["$", "$", 0, 0], ["€", "€", 0, 0], ["£", "£", 0, 0],
    ["+", "+", 0, 0], ["K", "K", 1, 0], ["M", "M", 1, 0], ["B", "B", 1, 0], ["×", "×", 1, 0],
    ["°", "°", 1, 0], ["#", "#", 0, 0],
    ["AED", "AED", 1, 1], ["د.إ", "د.إ", 1, 1], ["SAR", "SAR", 1, 1], ["ر.س", "ر.س", 1, 1],
    ["EGP", "EGP", 1, 1], ["ج.م", "ج.م", 1, 1], ["OMR", "OMR", 1, 1], ["ر.ع", "ر.ع", 1, 1]
];
var SIDES = ["Auto", "Left", "Right"];          // Left = symbol on the left of the number, Right = on the right
function symbolLabels() { var a = []; for (var i = 0; i < SYMBOLS.length; i++) a.push(SYMBOLS[i][0]); return a; }

function symExpr() {
    var rows = [];
    for (var i = 0; i < SYMBOLS.length; i++) rows.push("[" + q(SYMBOLS[i][1]) + "," + SYMBOLS[i][2] + "," + SYMBOLS[i][3] + "]");
    return [
        "var SQ_SYM=[" + rows.join(",") + "];",
        "function SYM(){var i=1,sd=1;try{i=Math.round(C.effect('Symbol')(1).value);sd=Math.round(C.effect('Symbol Side')(1).value);}catch(e){}",
        "  var r=SQ_SYM[i-1]||SQ_SYM[0];return {t:r[0],after:(sd==1?r[1]==1:sd==3),word:r[2]==1};}"
    ].join("\n");
}

function affixTextExpr(ctrlName, isPrefix) {
    return "var C=thisComp.layer(" + q(ctrlName) + ");\n" + symExpr() + "\n" +
        "var own=(value.text!==undefined)?value.text:String(value), P=SYM(), sp=(own!==''&&P.word)?' ':'';\n" +
        (isPrefix ? "own + (P.after ? '' : sp + P.t);" : "(P.after ? P.t + sp : '') + own;");
}

function affixPosExpr(ctrlName, isPrefix) {
    return coreExpr("thisComp.layer(" + q(ctrlName) + ")") + "\n" + LAYOUT + "\n" +
        "var L=LAY(), g=C.effect('Affix Gap')(1).value;\n" +
        (isPrefix ? "[L[0]-L[1]-g+ap[0], ap[1]];" : "[L[0]+g+ap[0], ap[1]];");
}

// ---------------- one-layer counter ----------------
//  text = prefix + number + suffix.  Shake-free without splitting layers:
//  text animators give every digit the same width (tabular figures) and centre it in its slot.
function partsExpr(prefix, suffix) {
    return symExpr() + "\n" +
        "function PARTS(t){var P=SYM(), sp=P.word?' ':'';return [" + q(prefix) + "+((P.after||P.t==='')?'':P.t+sp), S(t), ((P.after&&P.t!=='')?sp+P.t:'')+" + q(suffix) + "];}";
}

function singleTextExpr(prefix, suffix) {
    return coreExpr("thisLayer") + "\n" + partsExpr(prefix, suffix) + "\nvar p=PARTS(time);\np[0]+p[1]+p[2];";
}

function tabHead(ms, prefix, suffix) {
    var adv = [];
    for (var key in ms.adv) if (ms.adv.hasOwnProperty(key)) adv.push(q(key) + ":" + ms.adv[key]);
    return coreExpr("thisLayer") + "\n" + partsExpr(prefix, suffix) + "\n" + [
        "var ADV={" + adv.join(",") + "}, FS0=" + ms.fs0 + ", MW=" + ms.mw + ", MA=" + ms.ma + ";",
        "var fs=FS0; try{var z=text.sourceText.style.fontSize; if(z>0) fs=z;}catch(e){}",
        "function adv(c){var v=ADV[c];return (v===undefined?ADV['0']:v)*fs/100;}",
        "function isD(c){var x=c.charCodeAt(0);return (x>=48&&x<=57)||(x>=1632&&x<=1641);}",
        "var DW=(E('Arabic Digits',time)>0.5?MA:MW)*fs/100*Math.max(1,E('Digit Width %',time))/100, TR=E('Tracking',time);",
        "function tabW(z){var w=0;for(var j=0;j<z.length;j++){var c=z.charAt(j);w+=isD(c)?DW:adv(c);}return w+TR*Math.max(0,z.length-1);}",
        "var p=PARTS(time), s=p[1], k=textIndex-1-p[0].length, isN=(k>=0&&k<s.length), ch=isN?s.charAt(k):'';"
    ].join("\n");
}

// tracking: each digit's advance becomes the slot width (After-tracking, so AE's own alignment stays right)
function selTrack(head, T) {
    return head + "\nvar T=" + T + ";\n" +
        "var t=isN?((isD(ch)?DW-adv(ch):0)+(k<s.length-1?TR:0)):0;\n" +
        "isN?((t*1000/fs+T)/(2*T)*100):0;";
}
// shift: centre each digit in its slot + glide when the digit count changes
function selShift(head, P) {
    return head + "\nvar PP=" + P + ";\n" +
        "var al=Math.round(E('Align',time)), sm=Math.max(0,E('Smooth Glide',time)), G=0;\n" +
        "if(sm>0&&al<3){var N=10,acc=0;for(var q2=0;q2<N;q2++)acc+=tabW(S(time-sm*q2/(N-1)));var W=tabW(s);G=(al==2?-(W-acc/N)/2:-(W-acc/N));}\n" +
        "var off=G+((isN&&isD(ch))?(DW-adv(ch))/2:0);\n" +
        "(off+PP)/(2*PP)*100;";
}

function addSymbolControls(layer, o) {
    if (!getFx(layer, "Symbol")) addDropdown(layer, "Symbol", symbolLabels(), o.symbol);
    else setFx(layer, "Symbol", o.symbol);
    if (!getFx(layer, "Symbol Side")) addDropdown(layer, "Symbol Side", SIDES, o.side);
    else setFx(layer, "Symbol Side", o.side);
}

// prefix / suffix layers of a zero-shake counter (always present, may be empty)
function setStaticText(layer, txt) {
    var p = layer.property("Source Text"), td = p.value;
    try { td.text = txt; p.setValue(td); }
    catch (e) { td.text = "\u200B"; p.setValue(td); }
}
function ensureAffix(comp, ctrl, st, isPrefix, txt) {
    var nm = ctrl.name + (isPrefix ? " \u00b7 prefix" : " \u00b7 suffix"), L = null, kids = childrenOf(comp, ctrl);
    for (var i = 0; i < kids.length; i++) if (kids[i].name === nm) L = kids[i];
    if (!L) {
        L = comp.layers.addText("0");
        applyStyle(L, st, isPrefix ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.LEFT_JUSTIFY);
        L.name = nm; L.parent = ctrl; L.label = 9;
    }
    setStaticText(L, txt);
    L.property("Source Text").expression = affixTextExpr(ctrl.name, isPrefix);
    L.transform.position.expression = affixPosExpr(ctrl.name, isPrefix);
    return L;
}

// JS string literal (safe for any text, incl. Arabic)
function q(str) {
    var out = "\"";
    for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i), code = str.charCodeAt(i);
        if (c === "\\") out += "\\\\";
        else if (c === "\"") out += "\\\"";
        else if (code < 32 || code > 126) { var h = code.toString(16); while (h.length < 4) h = "0" + h; out += "\\u" + h; }
        else out += c;
    }
    return out + "\"";
}

// ------------------------------------------------------------------
//  JS-side formatter (to know how many slots are needed)
// ------------------------------------------------------------------
function fmtJS(v, d, cm, from) {
    var p = Math.pow(10, d), neg = v < 0;
    var r = Math.round(Math.abs(v) * p) / p;
    var s = r.toFixed(d), ip = s, fp = "", k = s.indexOf(".");
    if (k >= 0) { ip = s.substring(0, k); fp = s.substring(k); }
    if (cm && r >= from) {
        var o = "", n = 0;
        for (var i = ip.length - 1; i >= 0; i--) { o = ip.charAt(i) + o; n++; if (n % 3 === 0 && i > 0) o = "," + o; }
        ip = o;
    }
    return ((neg && r > 0) ? "-" : "") + ip + fp;
}

function neededSlots(a, b, dec, commas, from) {
    return Math.max(fmtJS(a, dec, commas, from).length, fmtJS(b, dec, commas, from).length, 1);
}

function multiplierFor(a, b) {
    var m = 1, big = Math.max(Math.abs(a), Math.abs(b));
    while (big / m > SLIDER_MAX) m *= 10;
    return m;
}

// ------------------------------------------------------------------
//  AE helpers
// ------------------------------------------------------------------
function isComp(it) { try { if (it instanceof CompItem) return true; } catch (e) {} try { return !!it && typeof it.numLayers === "number" && typeof it.layers === "object"; } catch (e2) { return false; } }
function isText(L) { try { if (L instanceof TextLayer) return true; } catch (e) {} try { return !!L.property("ADBE Text Properties"); } catch (e2) { return false; } }

function activeComp() {
    var c = comp || app.project.activeItem;
    if (!isComp(c)) { alert("Open a composition first.", SCRIPT_NAME); return null; }
    return c;
}

function layerNameExists(comp, name) {
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return true;
    return false;
}

function uniqueName(comp) {
    var n = 1;
    while (layerNameExists(comp, BASE_NAME + " " + n)) n++;
    return BASE_NAME + " " + n;
}

function fxParade(layer) { return layer.property("ADBE Effect Parade"); }

function getFx(layer, name) {
    try { var p = fxParade(layer); return p ? p.property(name) : null; } catch (e) { return null; }
}

function setFx(layer, name, val) {
    var fx = getFx(layer, name);
    if (fx) fx.property(1).setValue(val);
}

function addSlider(layer, name, val) {
    var fx = fxParade(layer).addProperty("ADBE Slider Control");
    fx.name = name;
    getFx(layer, name).property(1).setValue(val);
}

function addCheckbox(layer, name, on) {
    var fx = fxParade(layer).addProperty("ADBE Checkbox Control");
    fx.name = name;
    getFx(layer, name).property(1).setValue(on ? 1 : 0);
}

function addDropdown(layer, name, items, val) {
    try {
        var fx = fxParade(layer).addProperty("ADBE Dropdown Control");
        fx.name = name;
        getFx(layer, name).property(1).setPropertyParameters(items);
        getFx(layer, name).property(1).setValue(val);
    } catch (e) {
        try { var bad = getFx(layer, name); if (bad) bad.remove(); } catch (e2) {}
        addSlider(layer, name, val);   // fallback: 1 Left / 2 Center / 3 Right
    }
}

function isCounterCtrl(layer) { return getFx(layer, "Progress") !== null && getFx(layer, "Multiplier") !== null; }

function childrenOf(comp, ctrl) {
    var out = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        if (L.parent === ctrl && isText(L)) out.push(L);
    }
    return out;
}

function slotsOf(comp, ctrl) {
    var kids = childrenOf(comp, ctrl), out = [];
    for (var i = 0; i < kids.length; i++) {
        var m = kids[i].name.match(/ \u00b7 d(\d+)$/);
        if (m) out.push({ layer: kids[i], idx: parseInt(m[1], 10) });
    }
    return out;
}

// ---------------- fonts ----------------
function fnorm(x) { return String(x || "").toLowerCase().replace(/[\s\-_]/g, ""); }
// returns a PostScript name, null (no font asked) or false (not installed)
function resolveFont(name) {
    name = String(name || "");
    if (!name.replace(/\s/g, "")) return null;
    var n = fnorm(name), fam = null, all;
    try { all = app.fonts.allFonts; if (!all) return name; } catch (e) { return name; }   // AE < 2024: AE resolves it
    for (var i = 0; i < all.length; i++) {
        var group = all[i];
        for (var j = 0; j < group.length; j++) {
            var f = group[j], ps = "", hit = false;
            try { ps = f.postScriptName; } catch (e0) {}
            try { hit = n === fnorm(ps) || n === fnorm(f.fullName) || n === fnorm(f.familyName + f.styleName) || n === fnorm(f.nativeFullName) || n === fnorm(f.nativeFamilyName + f.nativeStyleName); } catch (e1) {}
            if (hit) return ps;
            try { if (!fam && (n === fnorm(f.familyName) || n === fnorm(f.nativeFamilyName))) fam = group; } catch (e2) {}
        }
    }
    if (fam) {
        for (var k = 0; k < fam.length; k++) { try { if (/^(regular|roman|book|normal)$/i.test(fam[k].styleName)) return fam[k].postScriptName; } catch (e3) {} }
        return fam[0].postScriptName;
    }
    return false;
}
function fontOrAlert(st, fontName) {
    var f = resolveFont(fontName);
    if (f === false) { alert("Font \"" + fontName + "\" is not installed. Type its name as in the Character panel (e.g. Montserrat Bold).", SCRIPT_NAME); return false; }
    if (f) st.font = f;
    return true;
}

// ---------------- text style ----------------
function readStyle(src) {
    var st = { font: null, size: 100, applyFill: true, fill: [1, 1, 1], applyStroke: false, stroke: [0, 0, 0], strokeW: 0, fauxBold: false, fauxItalic: false };
    if (!src) return st;
    var td = src.property("Source Text").value;
    try { st.font = td.font; } catch (e) {}
    try { st.size = td.fontSize; } catch (e) {}
    try { st.applyFill = td.applyFill; if (td.applyFill) st.fill = td.fillColor; } catch (e) {}
    try { st.applyStroke = td.applyStroke; if (td.applyStroke) { st.stroke = td.strokeColor; st.strokeW = td.strokeWidth; } } catch (e) {}
    try { st.fauxBold = td.fauxBold; st.fauxItalic = td.fauxItalic; } catch (e) {}
    return st;
}

function applyStyle(layer, st, just, text) {
    var p = layer.property("Source Text");
    var td = p.value;
    if (text !== undefined) td.text = text;
    try { td.resetCharStyle(); } catch (e) {}
    try { if (st.font) td.font = st.font; } catch (e) {}
    try { td.fontSize = st.size; } catch (e) {}
    try { td.applyFill = st.applyFill; if (st.applyFill) td.fillColor = st.fill; } catch (e) {}
    try { td.applyStroke = st.applyStroke; if (st.applyStroke) { td.strokeColor = st.stroke; td.strokeWidth = st.strokeW; } } catch (e) {}
    try { td.fauxBold = st.fauxBold; td.fauxItalic = st.fauxItalic; } catch (e) {}
    try { td.tracking = 0; } catch (e) {}
    try { td.autoKernType = AutoKernType.NO_AUTO_KERN; } catch (e) {}   // AE 2024+: no pair kerning, widths stay exact
    try { td.justification = just; } catch (e) {}
    p.setValue(td);
}

// advance width of each glyph, measured as  w("H?H") - w("HH")
function measure(comp, st, arabic) {
    var tmp = comp.layers.addText("HH");
    applyStyle(tmp, st, ParagraphJustification.LEFT_JUSTIFY);
    function w(str) {
        var p = tmp.property("Source Text"), td = p.value;
        td.text = str; p.setValue(td);
        return tmp.sourceRectAtTime(tmp.inPoint, false).width;
    }
    var base = w("HH"), adv = {}, mw = 0, ma = 0, i, c;
    for (i = 0; i < 10; i++) {
        c = String(i); adv[c] = w("H" + c + "H") - base; mw = Math.max(mw, adv[c]);
        c = String.fromCharCode(1632 + i); adv[c] = w("H" + c + "H") - base; ma = Math.max(ma, adv[c]);
    }
    adv[","] = w("H,H") - base; adv["."] = w("H.H") - base; adv["-"] = w("H-H") - base;
    tmp.remove();
    var fs0 = st.size > 0 ? st.size : 100;
    if (!(mw > 0)) mw = fs0 * 0.6;
    if (!(ma > 0)) ma = mw;
    var dw = Math.max(arabic ? ma : mw, adv["-"] || 0);
    var sw = Math.max(adv[","] || 0, adv["."] || 0);
    if (!(sw > 0)) sw = fs0 * 0.3;
    function nz(x) { return Math.round((x > 0 ? x : 0) * 100 / fs0 * 1000) / 1000; }
    var nadv = {};
    for (c in adv) if (adv.hasOwnProperty(c)) nadv[c] = nz(adv[c]);
    return { dw: Math.round(dw * 10) / 10, sw: Math.round(sw * 10) / 10, fs0: fs0, adv: nadv, mw: nz(mw), ma: nz(ma) };
}

// ---------------- one-layer rig ----------------
function textAnims(L) { return L.property("ADBE Text Properties").property("ADBE Text Animators"); }
function addAnim(L, name, propMatch, val, selExpr) {
    var an = textAnims(L).addProperty("ADBE Text Animator");
    an.name = name;
    var ix = an.propertyIndex;
    function props() { return textAnims(L).property(ix).property("ADBE Text Animator Properties"); }
    props().addProperty(propMatch);
    var pr = props().property(propMatch);
    try { pr.setValue(val); } catch (e) { if (val.length) props().property(propMatch).setValue([val[0], val[1]]); else throw e; }
    if (propMatch === "ADBE Text Tracking Amount") {
        try {
            var tt = props().property("ADBE Text Track Type");
            if (!tt) { props().addProperty("ADBE Text Track Type"); tt = props().property("ADBE Text Track Type"); }
            tt.setValue(3);                                   // After
        } catch (e2) {}
    }
    function sels() { return textAnims(L).property(ix).property("ADBE Text Selectors"); }
    sels().addProperty("ADBE Text Expressible Selector");
    sels().property(sels().numProperties).property("ADBE Text Expressible Amount").expression = selExpr;
}
function ensureSliderFx(L, name, v) { if (!getFx(L, name)) addSlider(L, name, v); }

function buildTabular(L, ms, prefix, suffix) {
    var A = textAnims(L);
    for (var i = A.numProperties; i >= 1; i--) if (String(A.property(i).name).indexOf("SQ ") === 0) A.property(i).remove();
    var T = 50000, P = Math.max(5000, Math.round(ms.fs0 * 50));
    var head = tabHead(ms, prefix, suffix);
    addAnim(L, "SQ Track Base", "ADBE Text Tracking Amount", -T, head + "\nisN?100:0;");
    addAnim(L, "SQ Track", "ADBE Text Tracking Amount", 2 * T, selTrack(head, T));
    addAnim(L, "SQ Shift Base", "ADBE Text Position 3D", [-P, 0, 0], "100;");
    addAnim(L, "SQ Shift", "ADBE Text Position 3D", [2 * P, 0, 0], selShift(head, P));
    L.property("Source Text").expression = singleTextExpr(prefix, suffix);
    try { L.comment = "SQC:" + escape(prefix) + "|" + escape(suffix); } catch (e) {}
}
function storedAffixes(L) {
    var m = String(L.comment || "").match(/^SQC:([^|]*)\|(.*)$/);
    return m ? [unescape(m[1]), unescape(m[2])] : ["", ""];
}

// ---------------- easing ----------------
function keyProgress(layer, t0, dur, easeType) {
    var p = getFx(layer, "Progress").property(1);
    p.setValueAtTime(t0, 0);
    p.setValueAtTime(t0 + dur, 100);
    if (easeType === 2) {
        p.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        p.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        return;
    }
    var a, b;
    if (easeType === 0)      { a = new KeyframeEase(0, 10);  b = new KeyframeEase(0, 85); }   // smooth stop
    else if (easeType === 1) { a = new KeyframeEase(0, 70);  b = new KeyframeEase(0, 70); }   // ease in-out
    else                     { a = new KeyframeEase(0, 0.1); b = new KeyframeEase(0, 100); }  // expo out
    p.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    p.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    p.setTemporalEaseAtKey(1, [a], [a]);
    p.setTemporalEaseAtKey(2, [b], [b]);
}

function addNumberControls(layer, o) {
    var m = multiplierFor(o.start, o.end);
    addSlider(layer, "Progress", 0);
    addSlider(layer, "Start", o.start / m);
    addSlider(layer, "End", o.end / m);
    addSlider(layer, "Multiplier", m);
    addSlider(layer, "Decimals", o.dec);
    addCheckbox(layer, "Commas", o.commas);
    addSlider(layer, "Comma From", o.from);
    addCheckbox(layer, "Arabic Digits", o.arabic);
}

// ------------------------------------------------------------------
//  Slot creation
// ------------------------------------------------------------------
function makeSlot(comp, ctrl, st, idx) {
    var L = comp.layers.addText("0");
    applyStyle(L, st, ParagraphJustification.CENTER_JUSTIFY);
    L.name = ctrl.name + " \u00b7 d" + idx;
    L.parent = ctrl;
    L.label = 9;
    L.property("Source Text").expression = slotTextExpr(ctrl.name, idx);
    L.transform.position.expression = slotPosExpr(ctrl.name, idx);
    return L;
}

function addMissingSlots(comp, ctrl, need) {
    var slots = slotsOf(comp, ctrl);
    if (slots.length >= need) return 0;
    var top = slots[0];
    for (var i = 1; i < slots.length; i++) if (slots[i].idx > top.idx) top = slots[i];
    var added = 0;
    for (var n = top.idx + 1; slots.length + added < need; n++) {
        var d = top.layer.duplicate();
        d.name = ctrl.name + " \u00b7 d" + n;
        var st = d.property("Source Text");
        st.expression = st.expression.replace(/var IDX=\d+;/, "var IDX=" + n + ";");
        var ps = d.transform.position;
        ps.expression = ps.expression.replace(/var IDX=\d+;/, "var IDX=" + n + ";");
        top = { layer: d, idx: n };
        added++;
    }
    return added;
}

// ------------------------------------------------------------------
//  Main actions
// ------------------------------------------------------------------
function findSourceText(comp) {
    var sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) if (isText(sel[i]) && !isCounterCtrl(sel[i])) return sel[i];
    return null;
}

function createCounter(o) {
    var comp = activeComp(); if (!comp) return;
    (function(){})("Squeezy Counter: Create");
    try {
        var src = o.useSel ? findSourceText(comp) : null;
        var st = readStyle(src);
        if (!fontOrAlert(st, o.font)) {  return; }
        var name = uniqueName(comp);
        SQ_LAST = name;
        var t0 = comp.time;
        var justs = [ParagraphJustification.LEFT_JUSTIFY, ParagraphJustification.CENTER_JUSTIFY, ParagraphJustification.RIGHT_JUSTIFY];

        if (o.mode === 0) {
            // ---------- one layer (tabular digits via text animators) ----------
            var T = comp.layers.addText("0");
            applyStyle(T, st, justs[o.align - 1]);
            T.name = name;
            T.label = 9;
            if (src) { T.parent = src.parent; T.transform.position.setValue([src.transform.position.value[0], src.transform.position.value[1]]); }
            else T.transform.position.setValue([comp.width / 2, comp.height / 2]);
            addNumberControls(T, o);
            addSymbolControls(T, o);
            addDropdown(T, "Align", ["Left", "Center", "Right"], o.align);
            addSlider(T, "Smooth Glide", o.glide);
            addSlider(T, "Digit Width %", 100);
            addSlider(T, "Tracking", 0);
            keyProgress(T, t0, o.dur, o.ease);
            buildTabular(T, measure(comp, st, o.arabic), o.prefix, o.suffix);
            if (src) src.enabled = false;
            T.selected = true;
        } else {
            // ---------- per-digit layers ----------
            var ctrl = comp.layers.addNull();
            ctrl.name = name;
            ctrl.label = 9;
            ctrl.transform.anchorPoint.setValue([0, 0]);
            if (src) { ctrl.parent = src.parent; ctrl.transform.position.setValue([src.transform.position.value[0], src.transform.position.value[1]]); }
            else ctrl.transform.position.setValue([comp.width / 2, comp.height / 2]);

            var ms = measure(comp, st, o.arabic);
            addNumberControls(ctrl, o);
            addDropdown(ctrl, "Align", ["Left", "Center", "Right"], o.align);
            addSlider(ctrl, "Smooth Glide", o.glide);
            addSlider(ctrl, "Digit Width", ms.dw);
            addSlider(ctrl, "Separator Width", ms.sw);
            addSlider(ctrl, "Tracking", 0);
            addSlider(ctrl, "Affix Gap", Math.round(st.size * 0.12));
            addSymbolControls(ctrl, o);
            keyProgress(ctrl, t0, o.dur, o.ease);

            var n = neededSlots(o.start, o.end, o.dec, o.commas, o.from);
            for (var i = 0; i < n; i++) makeSlot(comp, ctrl, st, i);

            ensureAffix(comp, ctrl, st, true, o.prefix);
            ensureAffix(comp, ctrl, st, false, o.suffix);
            ctrl.moveToBeginning();
            if (src) src.enabled = false;
            for (var s = 1; s <= comp.numLayers; s++) comp.layer(s).selected = false;
            ctrl.selected = true;
        }
    } catch (e) {
        alert("Error: " + e.toString() + (e.line ? "  (line " + e.line + ")" : ""), SCRIPT_NAME);
    }
    
}

function selectedCounter(comp) {
    var sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) {
        if (isCounterCtrl(sel[i])) return sel[i];
        if (sel[i].parent && isCounterCtrl(sel[i].parent)) return sel[i].parent;
    }
    return null;
}

function updateCounter(o) {
    var comp = activeComp(); if (!comp) return;
    var ctrl = selectedCounter(comp);
    if (!ctrl) { alert("Select a Squeezy Counter (its null or any of its layers).", SCRIPT_NAME); return; }
    (function(){})("Squeezy Counter: Update");
    try {
        var m = multiplierFor(o.start, o.end);
        setFx(ctrl, "Multiplier", m);
        setFx(ctrl, "Start", o.start / m);
        setFx(ctrl, "End", o.end / m);
        setFx(ctrl, "Decimals", o.dec);
        setFx(ctrl, "Commas", o.commas ? 1 : 0);
        setFx(ctrl, "Comma From", o.from);
        setFx(ctrl, "Arabic Digits", o.arabic ? 1 : 0);
        addSymbolControls(ctrl, o);
        var justs = [ParagraphJustification.LEFT_JUSTIFY, ParagraphJustification.CENTER_JUSTIFY, ParagraphJustification.RIGHT_JUSTIFY];
        if (isText(ctrl)) {
            // one layer
            if (!getFx(ctrl, "Align")) addDropdown(ctrl, "Align", ["Left", "Center", "Right"], o.align); else setFx(ctrl, "Align", o.align);
            if (!getFx(ctrl, "Smooth Glide")) addSlider(ctrl, "Smooth Glide", o.glide); else setFx(ctrl, "Smooth Glide", o.glide);
            ensureSliderFx(ctrl, "Digit Width %", 100);
            ensureSliderFx(ctrl, "Tracking", 0);
            var st1 = readStyle(ctrl);
            if (!fontOrAlert(st1, o.font)) {  return; }
            applyStyle(ctrl, st1, justs[o.align - 1]);
            buildTabular(ctrl, measure(comp, st1, o.arabic), o.prefix, o.suffix);
        } else {
            setFx(ctrl, "Align", o.align);
            setFx(ctrl, "Smooth Glide", o.glide);
            var slots = slotsOf(comp, ctrl);
            if (slots.length) {
                var stA = readStyle(slots[0].layer);
                if (!fontOrAlert(stA, o.font)) {  return; }
                if (o.font) {
                    var kids0 = childrenOf(comp, ctrl);
                    for (var k0 = 0; k0 < kids0.length; k0++) applyStyle(kids0[k0], stA, kids0[k0].property("Source Text").value.justification);
                }
                var ms = measure(comp, stA, o.arabic);
                setFx(ctrl, "Digit Width", ms.dw);
                setFx(ctrl, "Separator Width", ms.sw);
                addMissingSlots(comp, ctrl, neededSlots(o.start, o.end, o.dec, o.commas, o.from));
                ensureAffix(comp, ctrl, stA, true, o.prefix);
                ensureAffix(comp, ctrl, stA, false, o.suffix);
            }
        }
    } catch (e) {
        alert("Error: " + e.toString(), SCRIPT_NAME);
    }
    
}

function applyStyleToCounter() {
    var comp = activeComp(); if (!comp) return;
    var ctrl = selectedCounter(comp);
    if (!ctrl) { alert("Select the counter AND a styled text layer to copy from.", SCRIPT_NAME); return; }
    var src = null, sel = comp.selectedLayers;
    for (var i = 0; i < sel.length; i++) {
        var L = sel[i];
        if (isText(L) && L !== ctrl && L.parent !== ctrl && !isCounterCtrl(L)) { src = L; break; }
    }
    if (!src) { alert("Also select a text layer that has the font/size/color you want.", SCRIPT_NAME); return; }
    (function(){})("Squeezy Counter: Apply Style");
    try {
        var st = readStyle(src);
        if (!isText(ctrl)) {
            var kids = childrenOf(comp, ctrl);
            for (var k = 0; k < kids.length; k++) applyStyle(kids[k], st, kids[k].property("Source Text").value.justification);
            var ms = measure(comp, st, getFx(ctrl, "Arabic Digits").property(1).value > 0.5);
            setFx(ctrl, "Digit Width", ms.dw);
            setFx(ctrl, "Separator Width", ms.sw);
            setFx(ctrl, "Affix Gap", Math.round(st.size * 0.12));
        } else {
            applyStyle(ctrl, st, ctrl.property("Source Text").value.justification);
            if (getFx(ctrl, "Digit Width %")) {
                var af = storedAffixes(ctrl);
                buildTabular(ctrl, measure(comp, st, getFx(ctrl, "Arabic Digits").property(1).value > 0.5), af[0], af[1]);
            }
        }
    } catch (e) {
        alert("Error: " + e.toString(), SCRIPT_NAME);
    }
    
}

// ------------------------------------------------------------------
// Squeezy entry point
// ------------------------------------------------------------------
if (!comp) return "Open a composition first.";
function sqP(k, d) { var v = params[k]; return (v === undefined || v === null || v === "") ? d : v; }
function sqN(k, d) { var v = parseFloat(String(sqP(k, d)).replace(/,/g, "")); return isNaN(v) ? d : v; }
function sqIdx(list, v, d) { v = String(v); for (var i = 0; i < list.length; i++) if (list[i] === v) return i; return d; }
function sqB(k, d) { var v = params[k]; if (v === undefined || v === null) return d; return v === true || v === 1 || v === "true"; }

var o = {
    start: sqN("start", 0), end: sqN("end", 25000),
    dec: Math.max(0, Math.min(3, Math.round(sqN("decimals", 0)))),
    dur: Math.max(0.04, sqN("duration", 2)),
    ease: sqIdx(["Smooth Stop", "Ease In-Out", "Linear", "Expo Out"], sqP("easing", "Smooth Stop"), 0),
    commas: sqB("commas", true), from: sqN("commaFrom", 10000),
    arabic: String(sqP("digits", "")).indexOf("Arabic") === 0,
    symbol: sqIdx(symbolLabels(), sqP("symbol", "None"), 0) + 1,
    side: sqIdx(SIDES, sqP("side", "Auto"), 0) + 1,
    prefix: String(sqP("prefix", "")), suffix: String(sqP("suffix", "")),
    mode: String(sqP("mode", "One layer")).indexOf("Per") === 0 ? 1 : 0,
    font: String(sqP("font", "")),
    align: sqIdx(["Left", "Center", "Right"], sqP("align", "Center"), 1) + 1,
    glide: Math.max(0, sqN("glide", 0.25)),
    useSel: sqB("useSelected", true)
};

var act = String(sqP("action", "Create counter"));
if (act.indexOf("Update") === 0) {
    updateCounter(o);
    return SQ_MSG || "Counter updated.";
}
if (act.indexOf("Apply") === 0) {
    applyStyleToCounter();
    return SQ_MSG || "Style applied to the counter.";
}
createCounter(o);
return SQ_MSG || ("\u201C" + SQ_LAST + "\u201D counts " + fmtJS(o.start, o.dec, o.commas, o.from) + " \u2192 " + fmtJS(o.end, o.dec, o.commas, o.from) +
    ". Fine-tune it from its Effect Controls.");
