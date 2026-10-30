// Squeezy Duplicator: deep-duplicate comps so every nested precomp becomes its own copy
var roots = [];
var psel = app.project.selection;
for (var i = 0; i < psel.length; i++) if (psel[i] instanceof CompItem) roots.push(psel[i]);
if (!roots.length && comp) roots.push(comp);
if (!roots.length) return "Select a comp in the Project panel (or open one).";

var suffix = String(params.suffix || ""), find = String(params.find || ""), repl = String(params.replace || "");
if (!suffix && !find) suffix = "_copy";
var keepWords = [];
var kw = String(params.keep || "").split(",");
for (var k = 0; k < kw.length; k++) { var w = kw[k].replace(/^\s+|\s+$/g, ""); if (w) keepWords.push(w.toLowerCase()); }

function newName(n) {
    var s = String(n);
    if (find) s = s.split(find).join(repl);
    if (suffix) s = s + suffix;
    if (s === String(n)) s = s + "_copy";
    return s;
}
function isShared(c) {
    var n = String(c.name).toLowerCase();
    for (var i = 0; i < keepWords.length; i++) if (n.indexOf(keepWords[i]) >= 0) return true;
    return false;
}

// folders: one new folder per run, mirroring sub-folders of the originals
var baseFolder = roots[0].parentFolder, outFolder = null, sub = {};
if (params.folder) {
    outFolder = app.project.items.addFolder(newName(roots[0].name) + " (Squeezy)");
    outFolder.parentFolder = baseFolder;
}
function folderFor(c) {
    if (!outFolder) return c.parentFolder;
    var pf = c.parentFolder;
    if (!pf || pf === baseFolder || pf === app.project.rootFolder) return outFolder;
    if (!sub[pf.id]) { sub[pf.id] = app.project.items.addFolder(pf.name); sub[pf.id].parentFolder = outFolder; }
    return sub[pf.id];
}

var map = {}, made = [], renames = [], shared = 0;
function dup(c, isRoot) {
    if (map[c.id]) return map[c.id];
    if (!isRoot && isShared(c)) { map[c.id] = c; shared++; return c; }   // the comp you picked is always copied
    var d = c.duplicate();
    d.name = newName(c.name);
    d.parentFolder = folderFor(c);
    map[c.id] = d;
    made.push(d);
    renames.push([c.name, d.name]);
    for (var i = 1; i <= d.numLayers; i++) {
        var L = d.layer(i);
        if (L.source && L.source instanceof CompItem) {
            var nd = dup(L.source);
            if (nd !== L.source) L.replaceSource(nd, false);
        }
    }
    return d;
}
var tops = [];
for (var r = 0; r < roots.length; r++) {
    tops.push(dup(roots[r], true));
}

// point expressions at the new comps (comp("Old") -> comp("New"))
var fixed = 0;
function fixExpr(group) {
    for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p.propertyType === PropertyType.PROPERTY) {
            if (p.canSetExpression && p.expression) {
                var e = p.expression, e2 = e;
                for (var j = 0; j < renames.length; j++) {
                    e2 = e2.split('comp("' + renames[j][0] + '")').join('comp("' + renames[j][1] + '")');
                    e2 = e2.split("comp('" + renames[j][0] + "')").join("comp('" + renames[j][1] + "')");
                }
                if (e2 !== e) { try { p.expression = e2; fixed++; } catch (er) {} }
            }
        } else if (p.numProperties) fixExpr(p);
    }
}
if (params.expressions) {
    for (var m = 0; m < made.length; m++) for (var l = 1; l <= made[m].numLayers; l++) fixExpr(made[m].layer(l));
}
if (params.open && tops.length) { try { tops[0].openInViewer(); } catch (eo) {} }

return "Squeezy Duplicator: " + made.length + " comp" + (made.length === 1 ? "" : "s") + " copied"
    + (shared ? ", " + shared + " kept shared" : "") + (fixed ? ", " + fixed + " expression" + (fixed === 1 ? "" : "s") + " re-linked" : "");
