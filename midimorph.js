autowatch = 1;

var fromClip = null;
var toClip = null;

function setFrom(id) {
    if (fromClip !== null) {
        fromClip.property = null;
    }
    if (id === 0) {
        fromClip = null;
        return;
    }
    var fromId = "id " + id;
    post("from", fromId, "\n");
    var fire = false;
    fromClip = new LiveAPI(function() {
        if (fire) {
            post("cb", fromId, "\n");
            midiChange(fromId);
        }
    }, fromId);
    fire = true;
    fromClip.property = "notes";
}

function setTo(id) {
    var tid = "id " + id;
    toClip = new LiveAPI(function() {
        if (toId === tid) {
            midiChange(toId);
        }
    }, tid);
    toId = "id " + id;
    toClip.property = "notes";
}

function midiChange(id) {
    post("midi change", id, "\n");
}

function Note(pitch, start, duration, velocity, muted) {
    this.Pitch = pitch;
    this.Start = start;
    this.Duration = duration;
    this.Velocity = velocity;
    this.Muted = muted;
}

function generate() {
    if (fromClip === null || toClip === null) return;
}

function getMidiFromClip(clip) {
    var len = clip.get("length");
    var data = clip.call("get_notes", startTime, startPitch, timeRange, pitchRange);
    var notes = [];

    for(var i=2; i < (data.length - 1); i += 6) {
        var note = new Note(data[i+1], data[i+2], data[i+3], data[i+4], data[i+5]);
        notes.push(note);
    }
}