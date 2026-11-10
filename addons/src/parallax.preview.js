// Squeezy Parallax: live panel preview. Body of function (ctx, W, H, v, t).
// A four-layer scene moved with the same depth math as the AE rig (2D mode).
var K = W / 1920;                                       // the preview stands for a 1920 px wide comp
function n(x, d) { x = parseFloat(x); return isNaN(x) ? d : x; }
var A = n(v.travel, 200), P = n(v.push, 25), T = Math.max(0.5, n(v.duration, 5));
var SP = Math.max(n(v.depth, 100), 0) / 100 * 3, FD = n(v.focus, 50) / 100, BL = n(v.blur, 0);
var fill = v.fill !== false, smooth = v.smooth !== false, m = String(v.motion || "Push In");
var h = A / 2, plan = {
  "Push In": { p: [0, P] }, "Pull Out": { p: [P, 0] },
  "Pan Left": { x: [h, -h] }, "Pan Right": { x: [-h, h] },
  "Rise": { y: [h, -h] }, "Descend": { y: [-h, h] },
  "Orbit Left": { x: [h, -h], orbit: 1 }, "Orbit Right": { x: [-h, h], orbit: 1 },
  "Drift In": { p: [0, P], x: [-A / 4, A / 4] }, "Float (loop)": { float: A / 4 }
}[m] || {};

// timing: the move plays (max 4 s in the preview), holds, and loops
var play = Math.min(T, 4), hold = 0.6, tt = t % (play + hold * 2), u = Math.min(1, Math.max(0, (tt - hold) / play));
if (smooth) u = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
function at(r) { return r ? r[0] + (r[1] - r[0]) * u : 0; }
function span(r) { return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; }
var fl = plan.float || 0, ph = 2 * Math.PI * t / 6;
var cx = at(plan.x) + fl * Math.sin(ph), cy = at(plan.y) + fl * 0.5 * Math.sin(2 * ph + 1.3), pz = at(plan.p) / 100, orb = !!plan.orbit;

function zOf(d) { return 1 + SP * Math.min(Math.max(d, 0), 1); }
function lim(c, z) { return Math.min(c, z - 0.1); }
var zf = zOf(FD);

// scene, back to front. full = covers the frame (gets Fill Edges)
var C1 = "#8B6CFF", C2 = "#FF5FA8";
var scene = [
  { full: true, draw: function () {
      var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#120d2a"); g.addColorStop(0.62, "#3a2370"); g.addColorStop(1, "#b04a8c");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (var i = 0; i < 26; i++) { var sx = (i * 137.5 % 100) / 100 * W, sy = (i * 61.3 % 55) / 100 * H; ctx.fillRect(sx, sy, Math.max(1, W / 480), Math.max(1, W / 480)); }
      ctx.fillStyle = "rgba(255,210,240,0.9)"; ctx.beginPath(); ctx.arc(W * 0.74, H * 0.3, H * 0.09, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#2a1c58"; ctx.beginPath(); ctx.moveTo(0, H * 0.72);
      var pk = [[0.08, 0.5], [0.2, 0.62], [0.33, 0.44], [0.48, 0.6], [0.62, 0.47], [0.78, 0.63], [0.9, 0.52], [1, 0.6]];
      pk.forEach(function (p) { ctx.lineTo(p[0] * W, p[1] * H); });
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  } },
  { draw: function () {
      ctx.fillStyle = "#3d2a7a"; ctx.beginPath(); ctx.moveTo(-0.25 * W, H * 1.1);
      for (var i = 0; i <= 30; i++) { var x = -0.25 + i * 1.5 / 30; ctx.lineTo(x * W, H * (0.7 + 0.06 * Math.sin(x * 9))); }
      ctx.lineTo(1.25 * W, H * 1.1); ctx.closePath(); ctx.fill();
  } },
  { draw: function () {
      var bx = W * 0.5, by = H * 0.78, r = H * 0.16;
      ctx.fillStyle = "#24164a"; ctx.fillRect(bx - r * 0.12, by - r * 1.3, r * 0.24, r * 1.4);
      var g = ctx.createLinearGradient(0, by - r * 2.6, 0, by - r * 0.6); g.addColorStop(0, C1); g.addColorStop(1, C2);
      ctx.fillStyle = g;
      [[0, -1.9, 0.75], [-0.55, -1.35, 0.6], [0.55, -1.35, 0.6]].forEach(function (c) { ctx.beginPath(); ctx.arc(bx + c[0] * r, by + c[1] * r, c[2] * r, 0, 6.283); ctx.fill(); });
  } },
  { draw: function () {
      ctx.fillStyle = "#0c0818"; ctx.beginPath(); ctx.moveTo(-0.3 * W, H * 1.2);
      for (var i = 0; i <= 40; i++) { var x = -0.3 + i * 1.6 / 40, edge = Math.abs(x - 0.5) * 2; ctx.lineTo(x * W, H * (1.02 - 0.22 * Math.pow(edge, 2) + 0.03 * Math.sin(x * 40))); }
      ctx.lineTo(1.3 * W, H * 1.2); ctx.closePath(); ctx.fill();
  } }
];
var N = scene.length;
for (var i = 0; i < N; i++) {
  var L = scene[i], top = N - 1 - i, dep = top / (N - 1);   // top of the stack = closest
  if (v.order === "Bottom layer = closest") dep = 1 - dep;
  var z = zOf(dep), c1 = lim(pz, z), k = z / (z - c1), mm = 1 / (z - c1) - (orb ? 1 / (zf - lim(pz, zf)) : 0);
  var sx = -cx * mm * K, sy = -cy * mm * K, F = 1;
  if (fill && L.full) {
    var ax = span(plan.x) + Math.abs(fl), ay = span(plan.y) + Math.abs(fl) * 0.5;
    var ps = plan.p ? [Math.min(plan.p[0], plan.p[1]) / 100, 0, Math.max(plan.p[0], plan.p[1]) / 100] : [0];
    ps.forEach(function (c) {
      var cc = lim(c, z), kk = z / (z - cc), m2 = Math.abs(1 / (z - cc) - (orb ? 1 / (zf - lim(c, zf)) : 0));
      F = Math.max(F, (W + 2 * ax * m2 * K) / (W * kk), (H + 2 * ay * m2 * K) / (H * kk));
    });
    if (F > 1) F *= 1.01;
  }
  ctx.save();
  var b = BL * Math.abs(dep - FD) * K * 2;
  if (b > 0.3) ctx.filter = "blur(" + b.toFixed(1) + "px)";
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(k * F, k * F); ctx.translate(-W / 2, -H / 2);
  L.draw();
  ctx.restore();
}
