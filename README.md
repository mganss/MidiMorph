# MidiMorph

MidiMorph is a Max for Live device that allows smooth interpolation between two MIDI clips. 
The output can be played directly from the device, saved to a new clip, or continuously updated to a destination clip.
Source and destination clips are monitored for changes.

## Usage

1. Drag the device into a MIDI track
2. Select the source clip
3. Click the <kbd>From</kbd> button
4. Select the destination clip
5. Click the <kbd>To</kbd> button
6. Adjust the Morph dial (0 is identical to source, 1 is destination, 0.5 is half-way)

Output:

- Play directly from the device (if the <kbd>Play</kbd> toggle is on)
- Click the <kbd>Clip</kbd> button to save current state selected by Morph dial to new clip
- Create new clip, select it, then click the <kbd>Out</kbd> button to select permanent output to the newly created clip 
(will be overwritten whenever a new Morph value is selected or parameters changed)

## Algorithm

MidiMorph works by assigning pairs of notes from the source clips, 
then interpolating between the two notes of each pair to generate the intermediate notes.
The pairs are assigned so that the sum of note distances is minimal,
where distance is defined as the euclidean distance in the pitch/time-plane (like in the piano roll).
Finding the pairs in this way presents the classic [assignment problem](https://en.wikipedia.org/wiki/Assignment_problem) which is
solved here using the Jonker-Volgenant algorithm implemented in https://github.com/Fil/lap-jv.

Notes that remain unpaired (because the number of notes differ between the source and destination clips) can be 
handled in one of two ways:

1. They can paired
in additional assignment rounds, such that one note from the clip that has fewer notes then has multiple notes from 
the other clip assigned to it.
2. Remain unpaired and get faded or muted. Technically, they get paired with pseudo notes that are silent versions of themselves.

## Quantization

Selecting any of the values from the Quantize menu will quantize notes to the selected value. 
This applies to the endpoints as well, i.e. output at 0.0 and 1.0 are quantized, too.

## Unpaired Notes

Using the <kbd>Assign</kbd> toggle you can select what happens to notes that remain unpaired after first assignment 
pass as outlined above.
If it's on, the remaining notes are assigned in additional assignment rounds using the same algorithm until all notes have been paired.

If the <kbd>Assign</kbd> toggle is off, the remaining notes will not be assigned to notes from the other clip. Instead, they will
get paired with pseudo-notes that are silent versions of themselves. This means they will stay in place and fade out or get muted
(depending on the Mute/Fade selection described below).

## Mute/Fade

Notes that remained unpaired after the first round of assignment will either fade out or get muted. You can choose either behavior from
the Mute/Fade menu. In the fade case, the velocity will transition to zero and once it reaches zero, the note
will be removed. When mute is selected, the note will stay at its original velocity up to half way, then get removed.
