// Arabic Write-On: live panel preview. Body of function (ctx, W, H, v, t).
// The centre line the add-on traced through "\u0641\u0647\u0645\u064A", drawn the way AE's Stroke will draw it.
var D = {"w":1,"h":0.564,"brush":0.083,"path":[[0.974,0.188],[0.959,0.155],[0.926,0.133],[0.878,0.137],[0.852,0.155],[0.841,0.188],[0.859,0.148],[0.904,0.129],[0.948,0.144],[0.974,0.188],[0.97,0.225],[0.929,0.233],[0.882,0.24],[0.848,0.225],[0.841,0.21],[0.878,0.24],[0.926,0.233],[0.974,0.222],[0.974,0.269],[0.963,0.306],[0.944,0.317],[0.907,0.325],[0.856,0.328],[0.804,0.328],[0.76,0.339],[0.742,0.35],[0.731,0.376],[0.72,0.406],[0.701,0.435],[0.668,0.442],[0.653,0.424],[0.642,0.406],[0.642,0.358],[0.639,0.314],[0.65,0.291],[0.646,0.302],[0.605,0.325],[0.558,0.328],[0.513,0.306],[0.499,0.306],[0.491,0.262],[0.48,0.233],[0.462,0.21],[0.414,0.225],[0.385,0.244],[0.41,0.229],[0.455,0.214],[0.484,0.24],[0.499,0.288],[0.473,0.314],[0.462,0.317],[0.418,0.325],[0.381,0.314],[0.366,0.291],[0.374,0.255],[0.359,0.299],[0.326,0.314],[0.289,0.328],[0.241,0.321],[0.271,0.328],[0.285,0.358],[0.267,0.402],[0.263,0.402],[0.23,0.42],[0.179,0.428],[0.131,0.428],[0.083,0.42],[0.05,0.406],[0.028,0.372],[0.024,0.325],[0.035,0.28]],"dots":[[0.186,0.534,null,0.918],[0.116,0.534,null,0.926],[0.909,0.03,null,0.033]]};
var bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#0f1a17"); bg.addColorStop(1, "#0b0f14");
ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
var dur = Math.min(Math.max(parseFloat(String(v.duration || "2").replace(",", ".")) || 2, 0.3), 8), pop = Math.max(0.1, +v.pop || 0.3);
var cycle = dur + pop + 1.1, tt = t % cycle, prog = Math.min(1, tt / dur);
var s = Math.min(W * 0.8, H * 0.8 / D.h), ox = (W - s) / 2, oy = (H - s * D.h) / 2;
var lw = D.brush * s * ((+v.brush || 100) / 100);
function at(i) { return [ox + D.path[i][0] * s, oy + D.path[i][1] * s]; }
function line(n, style, w) {
    ctx.beginPath(); var p = at(0); ctx.moveTo(p[0], p[1]);
    var whole = Math.floor(n), frac = n - whole;
    for (var i = 1; i <= whole && i < D.path.length; i++) { p = at(i); ctx.lineTo(p[0], p[1]); }
    if (frac > 0 && whole + 1 < D.path.length) { var a = at(whole), b = at(whole + 1); ctx.lineTo(a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac); }
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
}
line(D.path.length - 1, "rgba(255,255,255,0.07)", lw);
var g = ctx.createLinearGradient(ox + s, 0, ox, 0); g.addColorStop(0, "#18B47B"); g.addColorStop(1, "#2FD3FF");
if (prog > 0) line(prog * (D.path.length - 1), g, lw);
// the pen
if (prog > 0 && prog < 1) { var n = prog * (D.path.length - 1), i0 = Math.floor(n), a0 = at(i0), b0 = at(Math.min(i0 + 1, D.path.length - 1)), f = n - i0;
    ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(a0[0] + (b0[0] - a0[0]) * f, a0[1] + (b0[1] - a0[1]) * f, Math.max(2, lw * 0.18), 0, 6.283); ctx.fill(); }
// dots pop when the stroke reaches them
D.dots.forEach(function (d) {
    var st = d[3] * dur, k = (tt - st) / pop, sc;
    if (k <= 0) sc = 0; else if (k >= 1) sc = 1;
    else if (v.bounce) sc = k < 0.6 ? 1.15 * Math.sin(k / 0.6 * Math.PI / 2) : 1.15 - 0.15 * Math.sin((k - 0.6) / 0.4 * Math.PI / 2);
    else sc = k * k * (3 - 2 * k);
    ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox + d[0] * s, oy + d[1] * s, d[2] * s / 2, 0, 6.283); ctx.stroke();
    if (sc > 0) { ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(ox + d[0] * s, oy + d[1] * s, d[2] * s / 2 * sc, 0, 6.283); ctx.fill(); }
});
