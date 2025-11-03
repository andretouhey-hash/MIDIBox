# MIDIBox Studio

MIDIBox Studio is a lightweight in-browser workstation for sketching melodies. Play an on-screen piano, capture your performance, and instantly hear it back without installing any additional software.

## Features

- **Responsive piano keyboard** – interact with a two-octave range using touch, mouse, or mapped computer keyboard shortcuts.
- **Real-time recording** – capture note-on/note-off data with precise timing, then review it in a structured table and colorful timeline.
- **Playback controls** – loop your performance with transport buttons for record, stop, and playback.
- **Sound design tweaks** – switch between sine, triangle, square, and sawtooth oscillators and fine-tune the master volume.
- **Portable exports** – download your sequence as JSON for sharing or future editing.

## Getting started

1. Open `index.html` in your preferred browser (Chrome, Edge, Firefox, and Safari are supported).
2. Use the on-screen keys or the mapped keyboard shortcuts (`A W S E D F T G Y H U J K O L P ; '` ) to trigger notes.
3. Click **Start recording**, perform your idea, then press **Stop**.
4. Use **Play recording** to audition the captured melody, **Clear** to reset, or **Export** to download the note data.

### Keyboard mapping

| Physical key | Note |
|--------------|------|
| A            | C4   |
| W            | C♯4  |
| S            | D4   |
| E            | D♯4  |
| D            | E4   |
| F            | F4   |
| T            | F♯4  |
| G            | G4   |
| Y            | G♯4  |
| H            | A4   |
| U            | A♯4  |
| J            | B4   |
| K            | C5   |
| O            | C♯5  |
| L            | D5   |
| P            | D♯5  |
| ;            | E5   |
| '            | F5   |

## Export format

The exported JSON file includes the waveform selection and an array of note events containing the note name, start time (in seconds), and duration.

```json
{
  "exportedAt": "2025-01-01T12:00:00.000Z",
  "waveform": "sine",
  "events": [
    { "note": "C4", "time": 0, "duration": 0.5 },
    { "note": "E4", "time": 0.5, "duration": 0.5 }
  ]
}
```

Import the JSON into your own tools or extend the project to translate the data into a MIDI file.
