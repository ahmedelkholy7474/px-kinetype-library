if (!comp) return "Open a composition first.";
var MODES = { "Middle of each word": 0, "After first letter": 1, "Longest word only": 2, "Every connection": 3 };
var mode = MODES[params.position]; if (mode === undefined) mode = 0;
var n = 0, skipped = 0;
var expr = [
 "var N=effect(\"SQ Kashida Amount\")(1), D=Math.max(effect(\"SQ Kashida Duration\")(1),0.01), B=effect(\"SQ Kashida Bounce\")(1)/100;",
 "var t=time-inPoint-effect(\"SQ Kashida Delay\")(1), p=Math.min(Math.max(t/D,0),1);",
 "var c1=2.6*B, c3=c1+1, e=(p<=0)?0:((p>=1)?1:1+c3*Math.pow(p-1,3)+c1*Math.pow(p-1,2));",
 "if (effect(\"SQ Kashida Collapse\")(1)==1){ var po=Math.min(Math.max((outPoint-time)/D,0),1); e=Math.min(e, 1-Math.pow(1-po,3)); }",
 "var K=Math.max(0,Math.round(N*e)), s=''+value, MODE=" + mode + ";",
 "function ar(c){ var x=c.charCodeAt(0); return (x>=0x0620&&x<=0x064A)||(x>=0x066E&&x<=0x06D3); }",
 "function joins(c){ return ar(c) && 'اأإآٱدذرزوؤةءژ'.indexOf(c)<0; }",
 "var spots=[], words=[], st=-1;",
 "for (var i=0;i<=s.length;i++){ var ch=i<s.length?s.charAt(i):' '; if(ar(ch)||ch=='\\u0640'){ if(st<0) st=i; } else if(st>=0){ words.push([st,i]); st=-1; } }",
 "function cand(w){ var r=[]; for(var j=w[0];j<w[1]-1;j++){ if(joins(s.charAt(j)) && ar(s.charAt(j+1))) r.push(j+1); } return r; }",
 "if (MODE==2){ var best=null; for (var w=0;w<words.length;w++) if(!best||words[w][1]-words[w][0]>best[1]-best[0]) best=words[w]; if(best) words=[best]; }",
 "for (var w2=0; w2<words.length; w2++){ var c=cand(words[w2]); if(!c.length) continue;",
 "  if (MODE==3) spots=spots.concat(c); else if (MODE==1) spots.push(c[0]); else spots.push(c[Math.floor((c.length-1)/2)]); }",
 "var out='', last=0, run=''; for (var q=0;q<K;q++) run+='\\u0640';",
 "spots.sort(function(a,b){return a-b;}); for (var z=0; z<spots.length; z++){ out+=s.substring(last,spots[z])+run; last=spots[z]; }",
 "out+=s.substring(last); out;"
].join("\n");
for (var i = 0; i < layers.length; i++) {
    var l = layers[i];
    if (!l.property("ADBE Text Properties")) { skipped++; continue; }
    var txt = String(l.property("ADBE Text Properties").property("ADBE Text Document").value.text);
    if (!/[ؠ-ي]/.test(txt)) { skipped++; continue; }
    sqSlider(l, "SQ Kashida Amount", params.amount);
    sqSlider(l, "SQ Kashida Duration", params.duration);
    sqSlider(l, "SQ Kashida Bounce", params.bounce);
    sqSlider(l, "SQ Kashida Delay", params.delay);
    sqCheckbox(l, "SQ Kashida Collapse", params.collapse);
    l.property("ADBE Text Properties").property("ADBE Text Document").expression = expr;
    n++;
}
if (!n) return "Select an Arabic text layer.";
return "Kashida Stretch on " + n + " layer" + (n > 1 ? "s" : "") + (skipped ? " (" + skipped + " skipped, not Arabic text)" : "");
