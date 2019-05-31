autowatch = 1;
outlets = 2;

include("lap.js");

var clips = {
    from: null,
    to: null
};
var ids = {
    from: 0,
    to: 0
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
}

var ticksPerBeat = 480;

function setTicksPerBeat(ticks) {
    post("ticks per beat", ticks, "\n");
    ticksPerBeat = ticks;
}

function setClip(name, id) {
    if (!init) {
        post("no init", name, id, "\n");
        ids[name] = id;
        return;
    }
    if (clips[name] !== null) {
        clips[name].property = null;
    }
    if (id === 0) {
        post("unset", name);
        clips[name] = null;
        return;
    }
    var clipId = "id " + id;
    post(name, clipId, "\n");
    var fire = false;
    clips[name] = new LiveAPI(function() {
        if (fire) {
            post("cb", clipId, "\n");
            midiChange(clipId);
        }
    }, clipId);
    fire = true;
    clips[name].property = "notes";
}

function setFrom(id) {
    post("setFrom", id, "\n");
    setClip("from", id);
}

function setTo(id) {
    post("setTo", id, "\n");
    setClip("to", id);
}

function midiChange(id) {
    post("midi change", id, "\n");
    generate();
}

function Note(pitch, start, duration, velocity, muted) {
    this.Pitch = pitch;
    this.Start = start;
    this.Duration = duration;
    this.Velocity = velocity;
    this.Muted = muted;
}

var sequencesNumber = 10.0;
var steps = 10;

function interpolate(from, to, f) {
    return from + (to - from) * f;
}

function interpolateNotes(noteFrom, noteTo, f) {
    var note = new Note(
        Math.round(interpolate(noteFrom.Pitch, noteTo.Pitch, f)),
        interpolate(noteFrom.Start, noteTo.Start, f),
        interpolate(noteFrom.Duration, noteTo.Duration, f),
        Math.round(interpolate(noteFrom.Velocity, noteTo.Velocity, f)),
        Math.round(interpolate(noteFrom.Muted, noteTo.Muted, f))
    );
    return note;
}

var notes = [];
var clipLength;

function generate() {
    var fromClip = clips.from;
    var toClip = clips.to;
    if (fromClip === null || toClip === null) {
        return;
    }
    var fromNotes = getMidiFromClip(fromClip);
    var toNotes = getMidiFromClip(toClip);
    var pairs = findPairs(fromNotes, toNotes);
    var sequenceSize = steps / sequencesNumber;

    clipLength = Math.max(fromClip.get("length"), toClip.get("length"));
    
    outlet(1, clipLength * ticksPerBeat);

    notes = [];

    for (var i = 0; i <= steps; i++) {
        var step = (i % sequenceSize) / sequenceSize * pairs.length;
        var loStep = Math.floor(i / sequenceSize) * sequenceSize;
        var hiStep = loStep + sequenceSize;
        var stepNotes = [];

        for (var j = 0; j < pairs.length; j++) {
            var f = (j >= step ? loStep : hiStep) / steps;
            var noteFrom = pairs[j][0];
            var noteTo = pairs[j][1];
            var note = interpolateNotes(noteFrom, noteTo, f);

            post(i, j, f, noteFrom.Pitch, noteTo.Pitch, noteFrom.Start, noteTo.Start, note.Pitch, note.Start, "\n");

            // check for overlap
            for (var k = 0; k < j; k++) {
                var note2 = stepNotes[k];
                if (overlap(note, note2)) {
                    post("overlap", note.Start, note2.Start, note.Duration, note2.Duration, "\n");
                    if (note.Start < note2.Start) {
                        stepNotes[k] = note; // leave only note that starts earlier
                    }
                    break;
                }
            }

            if (k === j) {
                // no overlap
                stepNotes.push(note);
            }
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

    var note;
    for (i = 0; i < fromNotes.length; i++) {
        note = fromNotes[i];
        post("from", i, note.Pitch, note.Start, note.Duration, "\n");
    }

    for (i = 0; i < toNotes.length; i++) {
        note = toNotes[i];
        post("to", i, note.Pitch, note.Start, note.Duration, "\n");
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
                            toNote = new Note(toNote.Pitch, toNote.Start, toNote.Duration, toNote.Velocity, 1);
                        } else {
                            fromNote = new Note(fromNote.Pitch, fromNote.Start, fromNote.Duration, fromNote.Velocity, 1);
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
    while (pairs.length < totalDim);

    return pairs;
}

var pitchScale = 12.0;

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
        var note = new Note(pitch, start, duration, velocity, muted);
        notes.push(note);
    }

    return notes;
}

var morphValue = 0.5;

function setMorphValue(v) {
    morphValue = v;
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
    clip.call("set_notes");
    clip.call("notes", notes.length);

    for (var i = 0; i < notes.length; i++) {
        var note = notes[i];
        clip.call("note", note.Pitch, note.Start.toFixed(4), note.Duration.toFixed(4), note.Velocity, note.Muted);
    }

    clip.call("done");
}