autowatch = 1;
outlets = 3;

setoutletassist(0, "note output");
setoutletassist(1, "output clip length in ticks");
setoutletassist(2, "bang after generation caused by midi change");

include("lap.js");

var clips = {
    from: null,
    to: null,
    out: null
};
var ids = {
    from: 0,
    to: 0,
    out: 0
};
var init = false;

function liveInit() {
    init = true;
    if (ids.from !== 0) {
        setClip("from", ids.from);
    }
    if (ids.to !== 0) {
        setClip("to", ids.to);
    }
    if (ids.out !== 0) {
        setOut(ids.out);
    }
}

var ticksPerBeat = 480;

function setTicksPerBeat(ticks) {
    post("ticks per beat", ticks, "\n");
    ticksPerBeat = ticks;
}

var quantizeTicks = 1;

function setQuantize(t) {
    post("quantize", t, "\n");
    if (t === "1/4") {
        quantizeTicks = 480;
    }
    else if (t === "1/8") {
        quantizeTicks = 240;
    }
    else if (t === "1/16") {
        quantizeTicks = 120;
    }
    else if (t === "1/32") {
        quantizeTicks = 60;
    }
    else if (t === "1/64") {
        quantizeTicks = 30;
    }
    else {
        quantizeTicks = 1;
    }

    generateOut();
}

var mergeOverlap = true;

function setOverlap(v) {
    mergeOverlap = v === 1;
    generateOut();
}

var assignUnpaired = true;

function setUnpaired(v) {
    assignUnpaired = v === 1;
    generateOut();
}

var muteFade = "Mute";

function setMuteFade(v) {
    muteFade = v;
    generateOut();
}

var skipMuted = true;

function setSkipMuted(v) {
    skipMuted = v === 1;
    generateOut();
}

function setClip(name, id) {
    if (!init) {
        post("no init", name, id, "\n");
        ids[name] = id;
        return;
    }
    if (id === 0) {
        post("unset", name);
        clips[name] = null;
        return;
    }
    var clipId = "id " + id;
    post(name, clipId, "\n");
    clips[name] = new LiveAPI(clipId);
}

function setFrom(id) {
    post("setFrom", id, "\n");
    setClip("from", id);
}

function setTo(id) {
    post("setTo", id, "\n");
    setClip("to", id);
}

function setOut(id) {
    post("setOut", id, "\n");
    setClip("out", id);
    clipOut();
}

function midiChange() {
    post("midi change\n");
    generate();
    outlet(2, "bang");
}

function Note(pitch, start, duration, velocity, muted, pseudo) {
    this.Pitch = pitch;
    this.Start = start;
    this.Duration = duration;
    this.Velocity = velocity;
    this.Muted = muted;
    this.Pseudo = pseudo || false;
}

var sequencesNumber = 10.0;

function setSequence(v) {
    sequencesNumber = v;
    generateOut();
}

var steps = 10;

function setSteps(v) {
    steps = v;
    generateOut();
}

function interpolate(from, to, f) {
    return from + (to - from) * f;
}

function quantize(beats) {
    if (quantizeTicks === 1) return beats;
    var ticks = ticksPerBeat * beats;
    var quantizedTicks = Math.round(ticks / quantizeTicks) * quantizeTicks;
    var quantizedBeats = quantizedTicks / ticksPerBeat;
    return quantizedBeats;
}

function interpolateNotes(noteFrom, noteTo, f) {
    var note = new Note(
        Math.round(interpolate(noteFrom.Pitch, noteTo.Pitch, f)),
        quantize(interpolate(noteFrom.Start, noteTo.Start, f)),
        interpolate(noteFrom.Duration, noteTo.Duration, f),
        Math.round(interpolate(noteFrom.Velocity, noteTo.Velocity, f)),
        Math.round(interpolate(noteFrom.Muted, noteTo.Muted, f)),
        (noteFrom.Pseudo && f < 1.0) || (noteTo.Pseudo && f > 0.0)
    );
    return note;
}

var notes = [];
var clipLength;

function generateOut() {
    generate();
    clipOut();
}

function generate() {
    var fromClip = clips.from;
    var toClip = clips.to;

    notes = [];

    if (fromClip === null || toClip === null) {
        return;
    }

    var fromNotes = getMidiFromClip(fromClip);
    var toNotes = getMidiFromClip(toClip);
    var pairs = assignPairs(fromNotes, toNotes);
    var sequenceSize = steps / sequencesNumber;

    clipLength = Math.max(fromClip.get("length"), toClip.get("length"));
    
    outlet(1, clipLength * ticksPerBeat);
    outlet(0, "clear");

    for (var i = 0; i <= steps; i++) {
        var step = (i % sequenceSize) / sequenceSize * pairs.length;
        var loStep = Math.floor(i / sequenceSize) * sequenceSize;
        var hiStep = loStep + sequenceSize;
        var stepNotes = [];
        var j, k;
        var note, note2;

        for (j = 0; j < pairs.length; j++) {
            var f = (j >= step ? loStep : hiStep) / steps;
            var noteFrom = pairs[j][0];
            var noteTo = pairs[j][1];
            note = interpolateNotes(noteFrom, noteTo, f);

            post(i, j, f, noteFrom.Pitch, noteTo.Pitch, noteFrom.Start, noteTo.Start, note.Pitch, note.Start, "\n");

            stepNotes.push(note);
        }

        if (mergeOverlap) {
            stepNotes.sort(function (a, b) {
                if (a.Muted < b.Muted) return -1;
                if (a.Muted > b.Muted) return 1;
                if (a.Start < b.Start) return -1;
                if (a.Start > b.Start) return 1;
                if (a.Duration > b.Duration) return -1;
                if (a.Duration < b.Duration) return 1;
                if (a.Velocity > b.Velocity) return -1;
                if (a.Velocity < b.Velocity) return 1;
                return 0;
            });

            var mergedStepNotes = [];
            for (j = 0; j < stepNotes.length; j++) {
                note = stepNotes[j];
                for (k = 0; k < mergedStepNotes.length; k++) {
                    note2 = mergedStepNotes[k];
                    if (overlap(note, note2)) {
                        post("overlap", note.Start, note2.Start, note.Duration, note2.Duration, "\n");
                        break;
                    }
                }
                if (k === mergedStepNotes.length) mergedStepNotes.push(note);
            }

            stepNotes = mergedStepNotes;
        }

        notes.push(stepNotes);
 
        var outLists = [];

        for (j = 0; j < stepNotes.length; j++) {
            var stepNote = stepNotes[j];
            var ticks = Math.round(stepNote.Start * ticksPerBeat);
            var ix = (steps + 1) * ticks + i;
            var durationTicks = Math.round(stepNote.Duration * ticksPerBeat);
            var outNotes = [stepNote.Pitch, stepNote.Muted === 1 ? 0 : stepNote.Velocity, durationTicks];
            var outList = outLists[ix];
            if (outList === undefined) {
                outLists[ix] = outNotes;
            } else {
                outLists[ix] = outList.concat(outNotes);
            }
        }

        for (var oix in outLists) {
            post("out", oix, typeof(oix), "\n");
            post("outList", outLists[oix], "\n");
            outlet(0, "list", parseInt(oix), outLists[oix]);
        }
    }
}

function overlap(note1, note2) {
    if (note1.Pitch !== note2.Pitch) return false;
    var end1 = note1.Start + note1.Duration;
    var end2 = note2.Start + note2.Duration;
    return (note1.Start < end2 && note2.Start < end1);
}

var drumsMode = false;

function setDrumsMode(v) {
    drumsMode = v === 1;
    generateOut();
}

function groupByPitch(res, note) {
    var pitch = note.Pitch;
    res[pitch] = res[pitch] || [];
    res[pitch].push(note);
    return res;
}

function assignPairs(fromNotes, toNotes) {
    if (!drumsMode) {
        return findPairs(fromNotes, toNotes);
    } else {
        var fromNotesByPitch = fromNotes.reduce(groupByPitch, []);
        var toNotesByPitch = toNotes.reduce(groupByPitch, []);
        var fromPitches = Object.keys(fromNotesByPitch);
        var toPitches = Object.keys(toNotesByPitch);
        var pitches = fromPitches.concat(toPitches).reduce(function (r, p) {
            r[p] = p;
            return r;
        }, []);
        var pitch;
        var pairs = [];
        for (pitch in pitches) {
            var fromPitchNotes = fromNotesByPitch[pitch] || [];
            var toPitchNotes = toNotesByPitch[pitch] || [];
            var pitchPairs = findPairs(fromPitchNotes, toPitchNotes);
            pairs = pairs.concat(pitchPairs);
        }
        return pairs;
    }
}

function findPairs(fromNotes, toNotes) {
    var i, j;
    var pairs = [];
    var totalDim = Math.max(fromNotes.length, toNotes.length);
    var fromIndexes = [], toIndexes = [];
    var cost = function (il, jl) {
        var ilx = fromIndexes[il];
        var jlx = toIndexes[jl];
        if (ilx < fromNotes.length && jlx < toNotes.length) {
            var fromNote = fromNotes[ilx];
            var toNote = toNotes[jlx];
            return notesDistance(fromNote, toNote);
        }
        return 0;
    };
    var round = 0;
    var pairNote;
    var note;

    for (i = 0; i < fromNotes.length; i++) {
        note = fromNotes[i];
        post("from", i, note.Pitch, note.Start, note.Duration, "\n");
    }

    for (i = 0; i < toNotes.length; i++) {
        note = toNotes[i];
        post("to", i, note.Pitch, note.Start, note.Duration, "\n");
    }

    if (toNotes.length === 0) {
        for (i = 0; i < fromNotes.length; i++) {
            note = fromNotes[i];
            pairNote = createPairNote(note);
            pairs.push([note, pairNote]);
        }
        return pairs;
    }
    if (fromNotes.length === 0) {
        for (i = 0; i < toNotes.length; i++) {
            note = toNotes[i];
            pairNote = createPairNote(note);
            pairs.push([pairNote, note]);
        }
        return pairs;
    }

    do {
        if (fromIndexes.length === 0) {
            for (i = 0; i < fromNotes.length; i++)
                fromIndexes[i] = i;
        }
        if (toIndexes.length === 0) {
            for (j = 0; j < toNotes.length; j++)
                toIndexes[j] = j;
        }
        var dim = Math.max(fromIndexes.length, toIndexes.length);
        var r = lap(dim, cost);
        var ix, jx;
        var nextFromIndexes = [];
        var nextToIndexes = [];
        for (i = 0; i < dim; i++) {
            j = r.row[i];
            if (i < fromIndexes.length) {
                ix = fromIndexes[i];
                if (j < toIndexes.length) {
                    jx = toIndexes[j];
                    post("pair", ix, jx, "\n");
                    var fromNote = fromNotes[ix];
                    var toNote = toNotes[jx];
                    if (round > 0) {
                        if (fromNotes.length > toNotes.length) {
                            toNote = createPairNote(toNote);
                        } else {
                            fromNote = createPairNote(fromNote);
                        }
                    }
                    pairs.push([fromNote, toNote]);
                } else {
                    nextFromIndexes.push(ix);
                }
            } else {
                jx = toIndexes[j];
                nextToIndexes.push(jx);
            }
        }
        fromIndexes = nextFromIndexes;
        toIndexes = nextToIndexes;
        round++;
    }
    while (assignUnpaired && pairs.length < totalDim);

    if (!assignUnpaired) {
        for (i = 0; i < fromIndexes.length; i++) {
            note = fromNotes[fromIndexes[i]];
            pairNote = createPairNote(note);
            pairs.push([note, pairNote]);
        }
        for (i = 0; i < toIndexes.length; i++) {
            note = toNotes[toIndexes[i]];
            pairNote = createPairNote(note);
            pairs.push([pairNote, note]);
        }
    }

    return pairs;
}

function createPairNote(note) {
    if (muteFade === "Mute") {
        return new Note(note.Pitch, note.Start, note.Duration, note.Velocity, 1, true);
    } else {
        return new Note(note.Pitch, note.Start, note.Duration, 0, note.Muted, true);
    }
}

var pitchScale = 12.0;

function setPitchScale(v) {
    pitchScale = v;
    generateOut();
}

function notesDistance(noteA, noteB) {
    var startDist = noteA.Start - noteB.Start;
    var pitchDist = noteA.Pitch / pitchScale - noteB.Pitch / pitchScale;
    var dist = Math.sqrt(startDist * startDist + pitchDist * pitchDist);
    return dist;
}

function getMidiFromClip(clip) {
    var len = clip.get("length");
    var data = clip.call("get_notes", 0, 0, len, 128);
    var notes = [];

    for (var i = 2; i < (data.length - 1); i += 6) {
        var pitch = data[i + 1];
        var start = data[i + 2];
        var duration = data[i + 3];
        var velocity = data[i + 4];
        var muted = data[i + 5];
        if (muted === 1 && skipMuted) continue;
        var note = new Note(pitch, start, duration, velocity, muted);
        notes.push(note);
    }

    return notes;
}

var morphValue = 0.5;

function setMorphValue(v) {
    morphValue = v;
    clipOut();
}

function clip() {
    var step = Math.round(morphValue * steps);
    var stepNotes = notes[step];
    createClip(stepNotes);
}

function createClip(notes) {
    var track = new LiveAPI("this_device canonical_parent");
    var clipSlots = track.getcount("clip_slots");
    var clipSlot;

    for (var clipSlotNum = 0; clipSlotNum < clipSlots; clipSlotNum++) {
        clipSlot = new LiveAPI("this_device canonical_parent clip_slots " + clipSlotNum);
        var hasClip = clipSlot.get("has_clip").toString() !== "0";
        if (!hasClip) break;
    }

    if (clipSlotNum === clipSlots) {
        // have to create new clip slot (scene)
        var set = new LiveAPI("live_set");
        set.call("create_scene", -1);
        clipSlot = new LiveAPI("this_device canonical_parent clip_slots " + clipSlotNum);
    }

    var fromClip = clips.from;
    var toClip = clips.to;
    var len = Math.max(fromClip.get("length"), toClip.get("length"));

    clipSlot.call("create_clip", len);
    var clip = new LiveAPI("this_device canonical_parent clip_slots " + clipSlotNum + " clip");

    setNotes(clip, notes);
}

function setNotes(clip, notes) {
    var filteredNotes = filterPseudoNotes(notes);

    clip.call("set_notes");
    clip.call("notes", filteredNotes.length);

    for (var i = 0; i < filteredNotes.length; i++) {
        var note = filteredNotes[i];
        callNote(clip, note);
    }

    clip.call("done");
}

function clipOut() {
    post("clipOut\n");
    if (clips.out !== null) {
        var outClip = clips.out;
        var step = Math.round(morphValue * steps);
        var stepNotes = notes[step];
        if (stepNotes === undefined) stepNotes = [];
        replaceAllNotes(outClip, stepNotes);
    }
}

function filterPseudoNotes(notes) {
    var filteredNotes = [];
    for (var i = 0; i < notes.length; i++) {
        var note = notes[i];
        if (note.Pseudo && (note.Muted === 1 || note.Velocity === 0)) continue;
        filteredNotes.push(note);
    }
    return filteredNotes;
}

function callNote(clip, note) {
    clip.call("note", note.Pitch, note.Start.toFixed(4), note.Duration.toFixed(4), note.Velocity, note.Muted);
}

function replaceAllNotes(clip, notes) {
    var filteredNotes = filterPseudoNotes(notes);

    clip.call("select_all_notes");
    clip.call("replace_selected_notes");
    clip.call("notes", filteredNotes.length);

    for (var i = 0; i < filteredNotes.length; i++) {
        var note = filteredNotes[i];
        callNote(clip, note);
    }

    clip.call("done");
}