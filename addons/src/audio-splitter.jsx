// ---- Squeezy Audio Splitter: vocals / music / SFX from a video or audio layer ----
// The heavy lifting runs in a local Python engine (installed once, in the user's app data folder).
// AS_SPLIT_PY, AS_INSTALL_MAC, AS_INSTALL_WIN are injected by the library build.
if (!comp) throw new Error("Open a composition first.");
var isWin = $.os.indexOf("Windows") >= 0;
var SEP = isWin ? "\\" : "/";

function asPref() {
    try { return app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") === 1; } catch (e) { return true; }
}
if (!asPref()) throw new Error("Turn on: Settings > Scripting & Expressions > Allow Scripts to Write Files and Access Network. Then press Split again.");

function asWrite(path, text, crlf) {
    var f = new File(path); f.encoding = "UTF-8"; f.lineFeed = crlf ? "Windows" : "Unix";
    if (!f.open("w")) throw new Error("Could not write " + path);
    f.write(text); f.close(); return f;
}
function asRead(path) {
    var f = new File(path); if (!f.exists) return null;
    f.encoding = "UTF-8"; if (!f.open("r")) return null;
    var s = f.read(); f.close(); return s;
}
function asMkdir(path) { var d = new Folder(path); if (!d.exists) d.create(); return d; }
function asJSON(s) { try { return eval("(" + s + ")"); } catch (e) { return null; } }
function sh(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

// ---------- engine folder ----------
var BASE = Folder.userData.fsName + SEP + "Squeezy" + SEP + "AudioSplitter";
asMkdir(Folder.userData.fsName + SEP + "Squeezy"); asMkdir(BASE);
asWrite(BASE + SEP + "split.py", AS_SPLIT_PY, false);       // always the newest engine from Sync
var PY = isWin ? BASE + "\\venv\\Scripts\\python.exe" : BASE + "/venv/bin/python";
var installed = new File(BASE + SEP + "installed.txt").exists && new File(PY).exists;

function launchInstaller() {
    if (isWin) {
        var bat = BASE + "\\install-windows.bat";
        asWrite(bat, AS_INSTALL_WIN, true);
        system.callSystem('cmd.exe /c start "Squeezy Audio Splitter" "' + bat + '"');
    } else {
        var cmd = BASE + "/install-mac.command";
        asWrite(cmd, AS_INSTALL_MAC, false);
        system.callSystem("chmod +x " + sh(cmd));
        system.callSystem("open -a Terminal " + sh(cmd));
    }
}
if (params.action === "Install / repair engine" || !installed) {
    launchInstaller();
    return "Setting up the engine in a " + (isWin ? "command" : "Terminal") + " window (one time, about 2 GB). When it says Done, press Split again.";
}

// ---------- the layer ----------
var L = null;
for (var i = 0; i < layers.length; i++) {
    var c = layers[i];
    try { if (c.hasAudio && c.source && c.source.file) { L = c; break; } } catch (e) {}
}
if (!L) throw new Error("Select a video or audio layer (a footage file with sound).");
var srcFile = L.source.file;
if (!srcFile.exists) throw new Error("The footage file is missing on disk: " + srcFile.fsName);
var baseName = decodeURI(srcFile.name).replace(/\.[^.]+$/, "");
var OUTDIR = srcFile.parent.fsName + SEP + baseName + " stems";
asMkdir(OUTDIR);
var doneTxt = asRead(OUTDIR + SEP + "done.json"), errTxt = asRead(OUTDIR + SEP + "error.txt"), progTxt = asRead(OUTDIR + SEP + "progress.json");
var again = params.action === "Split again";

function importStems(done) {
    var keys = [["vocals", "Vocals", 11, params.vocals !== false], ["music", "Music", 9, params.music !== false], ["sfx", "SFX", 14, params.sfx !== false]];
    var folder = null;
    for (var j = 1; j <= app.project.numItems; j++) { var it = app.project.item(j); if (sqIsFolder(it) && it.name === "Squeezy Stems") { folder = it; break; } }
    if (!folder) folder = app.project.items.addFolder("Squeezy Stems");
    var made = 0, top = L;
    for (var k = 0; k < keys.length; k++) {
        if (!keys[k][3]) continue;
        var p = done.stems[keys[k][0]]; if (!p) continue;
        var f = new File(p); if (!f.exists) continue;
        var item = app.project.importFile(new ImportOptions(f));
        item.parentFolder = folder;
        var nl = comp.layers.add(item);
        nl.startTime = L.startTime;
        try { nl.inPoint = L.inPoint; nl.outPoint = L.outPoint; } catch (e1) {}
        nl.name = "SQ " + keys[k][1] + " · " + L.name;
        try { nl.label = keys[k][2]; } catch (e2) {}
        nl.moveBefore(top); top = nl;
        made++;
    }
    if (!made) throw new Error("No stem files found in " + OUTDIR);
    if (params.mute !== false) { try { L.audioEnabled = false; } catch (e3) {} }
    var warn = "";
    try { if (L.stretch !== 100 || L.timeRemapEnabled) warn = " (the layer is time-stretched / remapped, so check the sync)"; } catch (e4) {}
    return made + " stem" + (made === 1 ? "" : "s") + " added above " + L.name + warn;
}

// finished: bring the stems in
if (doneTxt && !again) {
    var done = asJSON(doneTxt);
    if (!done || !done.stems) throw new Error("Could not read " + OUTDIR + SEP + "done.json");
    return importStems(done);
}
// failed last time
if (errTxt && !again) {
    var first = errTxt.split("\n")[0];
    throw new Error("Split failed: " + first + "  (details in " + OUTDIR + SEP + "error.txt, choose Split again to retry)");
}
function pidAlive(pid) {
    if (!pid) return false;
    try {
        if (isWin) return String(system.callSystem('tasklist /FI "PID eq ' + pid + '" /NH')).indexOf(String(pid)) >= 0;
        return String(system.callSystem("kill -0 " + pid + " 2>/dev/null && echo alive")).indexOf("alive") >= 0;
    } catch (e) { return false; }
}
function logTail() {
    var t = (asRead(OUTDIR + SEP + "log.txt") || "").replace(/\r/g, "").split("\n"), keep = [];
    for (var z = t.length - 1; z >= 0 && keep.length < 3; z--) if (t[z].replace(/\s/g, "") && !/Warning|^\[/.test(t[z])) keep.unshift(t[z]);
    return keep.join(" | ").substring(0, 300);
}
var pr = progTxt ? asJSON(progTxt) : null;
// still running: report progress (the engine re-stamps the file every 15 s)
if (pr && pr.pct < 100 && !again) {
    var age = (new Date()).getTime() / 1000 - (pr.time || 0);
    if (age < 90) return "Splitting\u2026 " + Math.round(pr.pct) + "% \u00B7 " + pr.stage + (pr.msg ? " (" + pr.msg + ")" : "") + ". Press Split again to check.";
    if (pidAlive(pr.pid)) return "Still working at " + Math.round(pr.pct) + "% (" + pr.stage + "), the computer is busy. Press Split again in a minute.";
    throw new Error("The split stopped at " + Math.round(pr.pct) + "% (" + pr.stage + "). " + (logTail() || "No details.") + "  Choose Split again to restart.");
}
// a restart: stop the old engine first
if (again && pr && pr.pct < 100 && pidAlive(pr.pid)) {
    try { system.callSystem(isWin ? "taskkill /PID " + pr.pid + " /F" : "kill " + pr.pid); } catch (ek) {}
}

// ---------- start a new split in the background ----------
var files = ["done.json", "error.txt", "progress.json"];
for (var q = 0; q < files.length; q++) { var ff = new File(OUTDIR + SEP + files[q]); if (ff.exists) ff.remove(); }
var quality = params.quality === "Fast" ? "fast" : "best";
var stereo = params.stereo ? " --stereo" : "";
if (isWin) {
    var job = OUTDIR + "\\squeezy-split.bat";
    asWrite(job, '@echo off\r\n"' + PY + '" "' + BASE + '\\split.py" --in "' + srcFile.fsName + '" --out "' + OUTDIR + '" --quality ' + quality + stereo + ' > "' + OUTDIR + '\\log.txt" 2>&1\r\n', true);
    system.callSystem('cmd.exe /c start "Squeezy Split" /min "' + job + '"');
} else {
    var jobS = OUTDIR + "/squeezy-split.sh";
    asWrite(jobS, "#!/bin/sh\n" + sh(PY) + " " + sh(BASE + "/split.py") + " --in " + sh(srcFile.fsName) + " --out " + sh(OUTDIR) + " --quality " + quality + stereo + " > " + sh(OUTDIR + "/log.txt") + " 2>&1\n", false);
    system.callSystem("/bin/sh -c " + sh("nohup /bin/sh " + sh(jobS) + " >/dev/null 2>&1 < /dev/null &"));
}
var secs = 60; try { secs = Math.round(L.source.duration); } catch (e5) {}
return "Splitting " + baseName + " in the background (" + (quality === "best" ? "best quality" : "fast") + ", about " + Math.max(1, Math.round(secs * (quality === "best" ? 0.6 : 0.3) / 60 + 0.5)) + " min for " + secs + " s). Press Split again to check / import.";
