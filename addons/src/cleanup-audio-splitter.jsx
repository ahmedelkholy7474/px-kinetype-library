// Removes the local Audio Splitter engine (Python, PyTorch, models) from this computer.
var isWin = $.os.indexOf("Windows") >= 0;
var SEP = isWin ? "\\" : "/";
try { if (app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY") !== 1) throw 0; }
catch (e) { if (e === 0) throw new Error("Turn on: Settings > Scripting & Expressions > Allow Scripts to Write Files and Access Network. Then press Remove again."); }
var target = Folder.userData.fsName + SEP + "Squeezy" + SEP + "AudioSplitter";
// only ever this exact folder
if (!/[\\\/]Squeezy[\\\/]AudioSplitter$/.test(target)) throw new Error("Unexpected folder: " + target);
var dir = new Folder(target);
if (!dir.exists) return "Nothing to remove: the Audio Splitter engine is not on this computer.";
var size = "";
if (!isWin) { try { size = String(system.callSystem("du -sh '" + target.replace(/'/g, "'\\''") + "' 2>/dev/null")).split(/\s/)[0]; } catch (e1) {} }
if (isWin) system.callSystem('cmd.exe /c rmdir /s /q "' + target + '"');
else system.callSystem("rm -rf '" + target.replace(/'/g, "'\\''") + "'");
if (new Folder(target).exists) throw new Error("Could not remove " + target + ". Close any Terminal window that is still running the setup and try again.");
var parent = new Folder(Folder.userData.fsName + SEP + "Squeezy");
try { if (parent.exists && parent.getFiles().length === 0) parent.remove(); } catch (e2) {}
return "Audio Splitter engine removed" + (size ? " (" + size + " freed)" : "") + ".";
