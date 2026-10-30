# Squeezy Text Library

This folder is the online preset library. The panel downloads `library.json` when you press the bag icon (Sync).

```
categories.json     sidebar categories (id, name, icon, color)
presets/*.json      one file per preset
build.js            node build.js  ->  library.json (+ the offline copy inside the extension)
library.json        what the panel downloads
```

## Adding a preset
1. Send the reference video to Claude. Claude writes `presets/<id>.json` and runs `node build.js`.
2. Push to GitHub. Everyone presses **Sync** in the panel and the preset shows up in its category with a NEW tag.
3. To update a preset, keep the same `id` and raise `version`.

## Preset format (schema 1)
```jsonc
{
  "id": "glowing-bounce", "name": "Glowing Bounce", "category": "slide", "version": 1,
  "order": 5,                                // position in the grid
  "requires": "1.6",                         // minimum panel version (older panels show UPDATE PLUGIN)
  "seed": 53,                                // randomness seed
  "glow": { "size": 34, "intensity": 1.7, "settle": 0.3 },   // omit = no glow. size in px @100px text
  "layout": "sequence",                      // optional: one line/word at a time (palette per part)
  "palette": ["#2EE6FF", "#FFE14A"],
  "in":  { "animators": [ Animator, ... ] },
  "out": { "mirror": true }  |  { "animators": [ ... ] },
  "extras": [ { "type": "flashRects" | "sparkles" | "headStar" | "cursor", ... } ]
}
```
Animator:
```jsonc
{
  "name": "Drop",
  "basedOn": "chars" | "charsNoSpaces" | "words" | "lines",
  "order": "forward" | "backward" | "center" | "edges" | "random",
  "start": 0, "stagger": 0.16, "dur": 0.9,          // seconds
  "ease": "linear|step|inCubic|outQuad|outCubic|outQuart|outExpo|inOutCubic|inOutSine|outBack|outElastic|outBounce",
  "easeAmount": 1.7,                                 // outBack overshoot
  "envelope": "from" | "gate" | "pulse",            // from: start at props -> settle. gate: only while arriving
  "mod": { "type": "random" | "flicker" | "chance" | "ramp" | "expr", "min": -1, "max": 1, "rate": 24, "p": 0.2,
           "code": "return __i/__n;" },             // expr: raw expression code, sees __i __n __k __p __e __T time
  "glyph": true,                                     // changes letters (skipped for Arabic)
  "charRange": "unicode",
  "props": { "position": [0,-110], "scale": [100,100], "rotation": 0, "skew": 0, "opacity": 0,
             "blur": [0,0], "fillColor": "#FFC21A" | "palette" | "paletteB", "tracking": 0, "charOffset": 0, "charValue": 9608 }
}
```

## On the layer (Squeezy 1.7+)
- Markers **KT In** / **KT Out** on the text layer: drag them to make the in / out animation faster or slower.
- Fill colours are linked to Color Controls **KT Tint** / **KT Tint 2** (editable in the panel or Effect Controls).
- Direction: Arabic runs right-to-left, English left-to-right (panel: Auto / L→R / R←L). Sideways motion is mirrored for right-to-left.
