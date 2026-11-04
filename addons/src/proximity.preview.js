// Squeezy Proximity: live panel preview. Body of function (ctx, W, H, v, t).
// Three cards and an effector moving over them, using the same falloff math as the AE rig.
var LOOKS = {
  "Magnify": { on: { scale: 1 }, scale: 60 }, "Shrink": { on: { scale: 1 }, scale: -60 },
  "Reveal": { on: { opacity: 1 }, opacity: 100 }, "Fade out": { on: { opacity: 1 }, opacity: -100 },
  "Push away": { on: { position: 1 }, position: 120 }, "Pull in": { on: { position: 1 }, position: -120 },
  "Spin": { on: { rotation: 1 }, rotation: 180 }, "Focus": { on: { blur: 1 }, blur: -30 },
  "Color": { on: { color: 1 } }, "Pop": { on: { scale: 1, rotation: 1, color: 1 }, scale: 50, rotation: 20 }
};
var looks = v.looks instanceof Array ? v.looks : (v.look ? [v.look] : ["Magnify"]);
var on = {}, amt = { scale: 60, opacity: 100, rotation: 90, position: 120, blur: -30 };
looks.forEach(function (n) {
  var L = LOOKS[n]; if (!L) return;
  for (var k in L.on) on[k] = 1;
  ["scale", "opacity", "rotation", "position", "blur"].forEach(function (k) { if (L[k] !== undefined) amt[k] = L[k]; });
});
var k = W / 1600;                                   // the preview shows ~1600 px of a comp
var R = Math.max(1, (+v.radius || 300)) * k, F = Math.min(Math.max(+v.softness || 70, 0), 100) / 100, S = (v.amount === undefined ? 100 : +v.amount) / 100;
var col = /^#?[0-9a-f]{6}$/i.test(String(v.color || "")) ? String(v.color) : "#2FF3FF";
if (col[0] !== "#") col = "#" + col;
var cr = parseInt(col.slice(1, 3), 16), cg = parseInt(col.slice(3, 5), 16), cb = parseInt(col.slice(5, 7), 16);

// backdrop
var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#121220"); g.addColorStop(1, "#0b0b12");
ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

// effector path: a slow figure-eight across the three cards
var ex = W * (0.5 + 0.42 * Math.sin(t * 0.8)), ey = H * (0.5 + 0.16 * Math.sin(t * 1.6));
var cards = [0.24, 0.5, 0.76];
cards.forEach(function (fx) {
  var cx = W * fx, cy = H * 0.5, s = H * 0.42;
  var dx = cx - ex, dy = cy - ey, d = Math.sqrt(dx * dx + dy * dy), inn = R * (1 - F);
  var w = d <= inn ? 1 : (d >= R ? 0 : 1 - (d - inn) / Math.max(0.001, R - inn));
  w = w * w * (3 - 2 * w);
  if (v.invert) w = 1 - w;
  w *= S;
  var sc = on.scale ? Math.max(0, 1 + amt.scale / 100 * w) : 1;
  var a = on.opacity ? amt.opacity / 100 : 0, op = on.opacity ? (a >= 0 ? 1 - a * (1 - w) : 1 + a * w) : 1;
  var rot = on.rotation ? amt.rotation * w : 0;
  var bl = on.blur ? (amt.blur >= 0 ? amt.blur * w : -amt.blur * (1 - w)) * k : 0;
  var px = 0, py = 0;
  if (on.position && d > 0.001) { px = dx / d * amt.position * w * k; py = dy / d * amt.position * w * k; }
  var mix = on.color ? Math.min(1, Math.max(0, w)) : 0;
  ctx.save();
  ctx.translate(cx + px, cy + py); ctx.rotate(rot * Math.PI / 180); ctx.scale(sc, sc);
  ctx.globalAlpha = Math.min(1, Math.max(0, op));
  if (bl > 0.3) ctx.filter = "blur(" + bl.toFixed(1) + "px)";
  var r0 = Math.round(236 + (cr - 236) * mix), g0 = Math.round(232 + (cg - 232) * mix), b0 = Math.round(255 + (cb - 255) * mix);
  var gr = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  gr.addColorStop(0, "rgb(" + r0 + "," + g0 + "," + b0 + ")"); gr.addColorStop(1, "rgb(" + Math.round(r0 * 0.72) + "," + Math.round(g0 * 0.68) + "," + Math.round(b0 * 0.9) + ")");
  ctx.fillStyle = gr;
  var rr = s * 0.18;
  ctx.beginPath(); ctx.moveTo(-s / 2 + rr, -s / 2); ctx.arcTo(s / 2, -s / 2, s / 2, s / 2, rr); ctx.arcTo(s / 2, s / 2, -s / 2, s / 2, rr); ctx.arcTo(-s / 2, s / 2, -s / 2, -s / 2, rr); ctx.arcTo(-s / 2, -s / 2, s / 2, -s / 2, rr); ctx.closePath();
  ctx.fill();
  ctx.restore();
});

// effector: radius ring, soft core, dot
ctx.save();
ctx.strokeStyle = "rgba(47,243,255,0.55)"; ctx.lineWidth = Math.max(1, W / 500); ctx.setLineDash([W / 160, W / 220]);
ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.stroke();
ctx.setLineDash([]); ctx.strokeStyle = "rgba(47,243,255,0.22)";
ctx.beginPath(); ctx.arc(ex, ey, R * (1 - F), 0, Math.PI * 2); ctx.stroke();
ctx.fillStyle = "#2FF3FF"; ctx.beginPath(); ctx.arc(ex, ey, Math.max(3, W / 160), 0, Math.PI * 2); ctx.fill();
ctx.restore();
