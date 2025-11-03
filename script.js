const KEY_LAYOUT = [
  { note: "C4", type: "white", label: "C4", key: "A", code: "KeyA" },
  { note: "C#4", type: "black", label: "C♯4", key: "W", code: "KeyW" },
  { note: "D4", type: "white", label: "D4", key: "S", code: "KeyS" },
  { note: "D#4", type: "black", label: "D♯4", key: "E", code: "KeyE" },
  { note: "E4", type: "white", label: "E4", key: "D", code: "KeyD" },
  { note: "F4", type: "white", label: "F4", key: "F", code: "KeyF" },
  { note: "F#4", type: "black", label: "F♯4", key: "T", code: "KeyT" },
  { note: "G4", type: "white", label: "G4", key: "G", code: "KeyG" },
  { note: "G#4", type: "black", label: "G♯4", key: "Y", code: "KeyY" },
  { note: "A4", type: "white", label: "A4", key: "H", code: "KeyH" },
  { note: "A#4", type: "black", label: "A♯4", key: "U", code: "KeyU" },
  { note: "B4", type: "white", label: "B4", key: "J", code: "KeyJ" },
  { note: "C5", type: "white", label: "C5", key: "K", code: "KeyK" },
  { note: "C#5", type: "black", label: "C♯5", key: "O", code: "KeyO" },
  { note: "D5", type: "white", label: "D5", key: "L", code: "KeyL" },
  { note: "D#5", type: "black", label: "D♯5", key: "P", code: "KeyP" },
  { note: "E5", type: "white", label: "E5", key: ";", code: "Semicolon" },
  { note: "F5", type: "white", label: "F5", key: "'", code: "Quote" }
];

const NOTE_COLOR_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_OFFSETS = {
  C: -9,
  "C#": -8,
  Db: -8,
  D: -7,
  "D#": -6,
  Eb: -6,
  E: -5,
  F: -4,
  "F#": -3,
  Gb: -3,
  G: -2,
  "G#": -1,
  Ab: -1,
  A: 0,
  "A#": 1,
  Bb: 1,
  B: 2
};

const keyboardElement = document.getElementById("keyboard");
const statusElement = document.getElementById("status");
const waveformSelect = document.getElementById("waveform");
const recordButton = document.getElementById("recordButton");
const stopButton = document.getElementById("stopButton");
const playButton = document.getElementById("playButton");
const clearButton = document.getElementById("clearButton");
const exportButton = document.getElementById("exportButton");
const volumeSlider = document.getElementById("volume");
const volumeValue = document.getElementById("volumeValue");
const timelineElement = document.getElementById("timeline");
const tableBody = document.getElementById("recordedTable");

const noteElements = new Map();
const pointerToNote = new Map();
const keyboardToNote = Object.fromEntries(KEY_LAYOUT.filter((k) => k.code).map((k) => [k.code, k.note]));

let audioContext;
let masterGain;
let currentWaveform = waveformSelect.value;
let recordedEvents = [];
let recordingStartTime = null;
let isRecording = false;
let isPlaying = false;
let playbackTimeouts = [];
const activeVoices = new Map();
const activeUserVoices = new Map();

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  return audioContext;
}

function getMasterGain() {
  const context = getAudioContext();
  if (!masterGain) {
    masterGain = context.createGain();
    masterGain.gain.value = parseFloat(volumeSlider.value);
    masterGain.connect(context.destination);
  }
  return masterGain;
}

function noteToFrequency(note) {
  const match = note.match(/^([A-G])(#|b)?(\d)$/);
  if (!match) {
    throw new Error(`Invalid note: ${note}`);
  }
  const [, pitch, accidental = "", octaveStr] = match;
  const key = `${pitch}${accidental}`;
  const semitone = NOTE_OFFSETS[key];
  if (semitone === undefined) {
    throw new Error(`Unsupported accidental in note: ${note}`);
  }
  const octave = Number.parseInt(octaveStr, 10);
  const offsetFromA4 = semitone + (octave - 4) * 12;
  return 440 * Math.pow(2, offsetFromA4 / 12);
}

function createVoice(note) {
  const context = getAudioContext();
  const voiceGain = context.createGain();
  const oscillator = context.createOscillator();
  oscillator.type = currentWaveform;
  oscillator.frequency.setValueAtTime(noteToFrequency(note), context.currentTime);

  voiceGain.gain.setValueAtTime(0, context.currentTime);
  voiceGain.gain.linearRampToValueAtTime(1, context.currentTime + 0.015);

  oscillator.connect(voiceGain);
  voiceGain.connect(getMasterGain());
  oscillator.start();

  return {
    note,
    osc: oscillator,
    gain: voiceGain,
    recordStart: null,
    source: "user",
    stopped: false
  };
}

function setStatus(message) {
  statusElement.textContent = message;
}

function addVoice(note, voice) {
  if (!activeVoices.has(note)) {
    activeVoices.set(note, new Set());
  }
  activeVoices.get(note).add(voice);
  noteElements.get(note)?.classList.add("active");
}

function removeVoice(note, voice) {
  const voices = activeVoices.get(note);
  if (!voices) {
    return;
  }
  voices.delete(voice);
  if (voices.size === 0) {
    activeVoices.delete(note);
    noteElements.get(note)?.classList.remove("active");
  }
}

function finishVoice(note, voice, { recordable = false } = {}) {
  const context = getAudioContext();
  if (voice.stopped) {
    removeVoice(note, voice);
    return;
  }
  voice.stopped = true;
  const now = context.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0, now, 0.07);
  voice.osc.stop(now + 0.35);

  if (recordable && recordingStartTime != null && voice.recordStart != null) {
    const duration = Math.max(0.05, (context.currentTime - recordingStartTime) - voice.recordStart);
    recordedEvents.push({
      note,
      time: Number.parseFloat(voice.recordStart.toFixed(3)),
      duration: Number.parseFloat(duration.toFixed(3))
    });
    recordedEvents.sort((a, b) => a.time - b.time);
    renderRecordedEvents();
  }

  removeVoice(note, voice);
}

function startNote(note, { recordable = false, source = "user" } = {}) {
  const context = getAudioContext();
  if (context.state === "suspended") {
    context.resume();
  }
  const voice = createVoice(note);
  voice.source = source;
  if (recordable && recordingStartTime != null) {
    voice.recordStart = context.currentTime - recordingStartTime;
  }
  addVoice(note, voice);
  return voice;
}

function startUserNote(note) {
  if (activeUserVoices.has(note)) {
    return;
  }
  const voice = startNote(note, { recordable: isRecording, source: "user" });
  activeUserVoices.set(note, voice);
}

function stopUserNote(note) {
  const voice = activeUserVoices.get(note);
  if (!voice) {
    return;
  }
  finishVoice(note, voice, { recordable: isRecording });
  activeUserVoices.delete(note);
}

function startPlaybackVoice(note, duration) {
  const playbackVoice = startNote(note, { recordable: false, source: "playback" });
  const releaseTimeout = window.setTimeout(() => {
    finishVoice(note, playbackVoice, { recordable: false });
  }, Math.max(duration * 1000, 60));
  playbackTimeouts.push(releaseTimeout);
}

function clearPlaybackSchedule() {
  playbackTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  playbackTimeouts = [];
}

function stopPlaybackVoices() {
  activeVoices.forEach((voices, note) => {
    Array.from(voices)
      .filter((voice) => voice.source === "playback")
      .forEach((voice) => finishVoice(note, voice, { recordable: false }));
  });
}

function startRecording() {
  const context = getAudioContext();
  context.resume();
  recordedEvents = [];
  recordingStartTime = context.currentTime;
  isRecording = true;
  renderRecordedEvents();
  updateControls();
  setStatus("Recording… Play your melody!");
}

function stopRecording() {
  if (!isRecording) {
    return;
  }
  const activeNotes = Array.from(activeUserVoices.entries());
  activeNotes.forEach(([note, voice]) => {
    finishVoice(note, voice, { recordable: true });
    activeUserVoices.delete(note);
  });
  isRecording = false;
  recordingStartTime = null;
  updateControls();
  if (recordedEvents.length) {
    setStatus(`Recording stopped. Captured ${recordedEvents.length} ${recordedEvents.length === 1 ? "note" : "notes"}.`);
  } else {
    setStatus("Recording stopped. No notes captured.");
  }
}

function startPlayback() {
  if (!recordedEvents.length) {
    return;
  }
  const context = getAudioContext();
  context.resume();
  clearPlaybackSchedule();
  stopPlaybackVoices();
  isPlaying = true;
  updateControls();
  setStatus("Playing recording…");

  const startDelay = 0.15;

  recordedEvents.forEach((event) => {
    const scheduleDelay = Math.max(0, event.time + startDelay);
    const timeoutId = window.setTimeout(() => {
      startPlaybackVoice(event.note, event.duration);
    }, scheduleDelay * 1000);
    playbackTimeouts.push(timeoutId);
  });

  const totalDuration = recordedEvents.reduce((max, event) => Math.max(max, event.time + event.duration), 0) + startDelay + 0.4;
  const stopId = window.setTimeout(() => {
    stopPlayback();
    setStatus("Playback finished.");
  }, totalDuration * 1000);
  playbackTimeouts.push(stopId);
}

function stopPlayback() {
  if (!isPlaying) {
    clearPlaybackSchedule();
    stopPlaybackVoices();
    updateControls();
    return;
  }
  clearPlaybackSchedule();
  stopPlaybackVoices();
  isPlaying = false;
  updateControls();
}

function clearRecording() {
  recordedEvents = [];
  renderRecordedEvents();
  updateControls();
  setStatus("Cleared recorded notes.");
}

function exportRecording() {
  if (!recordedEvents.length) {
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    waveform: currentWaveform,
    events: recordedEvents
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "midibox-sequence.json";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  setStatus("Exported sequence as JSON.");
}

function renderRecordedEvents() {
  if (!recordedEvents.length) {
    tableBody.innerHTML = '<tr><td colspan="4" class="empty">No notes recorded yet.</td></tr>';
    timelineElement.textContent = "No notes recorded yet.";
    timelineElement.classList.remove("has-data");
    return;
  }

  timelineElement.classList.add("has-data");
  tableBody.innerHTML = recordedEvents
    .map((event, index) => {
      return `<tr><td>${index + 1}</td><td>${event.note}</td><td>${event.time.toFixed(2)}</td><td>${event.duration.toFixed(2)}</td></tr>`;
    })
    .join("");

  const totalDuration = recordedEvents.reduce((max, event) => Math.max(max, event.time + event.duration), 0);
  const safeTotal = totalDuration > 0 ? totalDuration : 1;
  timelineElement.innerHTML = "";

  recordedEvents.forEach((event) => {
    const block = document.createElement("div");
    block.className = "note-block";
    const noteName = event.note.replace(/\d/g, "");
    const index = NOTE_COLOR_SCALE.indexOf(noteName);
    const hue = index >= 0 ? Math.round((index / NOTE_COLOR_SCALE.length) * 360) : 195;
    block.style.background = `hsl(${hue} 75% 60% / 0.88)`;
    block.style.boxShadow = `0 10px 22px hsl(${hue} 75% 45% / 0.35)`;

    const widthPercent = Math.max((event.duration / safeTotal) * 100, 2);
    const leftPercent = Math.min((event.time / safeTotal) * 100, 100);
    const clampedWidth = Math.min(widthPercent, Math.max(0, 100 - leftPercent));

    block.style.width = `${clampedWidth}%`;
    block.style.left = `${leftPercent}%`;
    block.textContent = event.note;
    block.title = `${event.note} • start ${event.time.toFixed(2)}s • duration ${event.duration.toFixed(2)}s`;
    timelineElement.appendChild(block);
  });
}

function updateControls() {
  recordButton.disabled = isRecording || isPlaying;
  stopButton.disabled = !isRecording && !isPlaying;
  playButton.disabled = isRecording || isPlaying || !recordedEvents.length;
  clearButton.disabled = isRecording || isPlaying || !recordedEvents.length;
  exportButton.disabled = !recordedEvents.length;
}

function createKeyboard() {
  const rootStyles = getComputedStyle(document.documentElement);
  const whiteKeyWidth = Number.parseFloat(rootStyles.getPropertyValue("--white-key-width")) || 72;
  const blackKeyWidth = Number.parseFloat(rootStyles.getPropertyValue("--black-key-width")) || 44;

  let whiteIndex = 0;
  KEY_LAYOUT.forEach((layout) => {
    const keyButton = document.createElement("button");
    keyButton.className = `key ${layout.type}`;
    keyButton.type = "button";
    keyButton.dataset.note = layout.note;
    keyButton.dataset.code = layout.code;
    keyButton.setAttribute("aria-label", `${layout.label} piano key`);

    if (layout.type === "white") {
      keyButton.style.left = `${whiteIndex * whiteKeyWidth}px`;
      keyButton.style.width = `var(--white-key-width)`;
      whiteIndex += 1;
    } else {
      keyButton.style.left = `${whiteIndex * whiteKeyWidth - blackKeyWidth / 2}px`;
      keyButton.style.width = `var(--black-key-width)`;
    }

    const noteLabel = document.createElement("span");
    noteLabel.className = "note-label";
    noteLabel.textContent = layout.label;
    const shortcut = document.createElement("span");
    shortcut.className = "shortcut";
    shortcut.textContent = layout.key;

    keyButton.append(noteLabel, shortcut);
    keyboardElement.appendChild(keyButton);
    noteElements.set(layout.note, keyButton);

    keyButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      keyButton.setPointerCapture(event.pointerId);
      pointerToNote.set(event.pointerId, layout.note);
      startUserNote(layout.note);
    });

    keyButton.addEventListener("pointerup", (event) => {
      event.preventDefault();
      const note = pointerToNote.get(event.pointerId);
      if (note) {
        stopUserNote(note);
        pointerToNote.delete(event.pointerId);
      }
    });

    keyButton.addEventListener("lostpointercapture", (event) => {
      const note = pointerToNote.get(event.pointerId);
      if (note) {
        stopUserNote(note);
        pointerToNote.delete(event.pointerId);
      }
    });

    keyButton.addEventListener("pointercancel", (event) => {
      event.preventDefault();
      const note = pointerToNote.get(event.pointerId);
      if (note) {
        stopUserNote(note);
        pointerToNote.delete(event.pointerId);
      }
    });
  });
}

function handleKeyDown(event) {
  if (event.repeat) {
    return;
  }
  const note = keyboardToNote[event.code];
  if (!note) {
    return;
  }
  event.preventDefault();
  startUserNote(note);
}

function handleKeyUp(event) {
  const note = keyboardToNote[event.code];
  if (!note) {
    return;
  }
  event.preventDefault();
  stopUserNote(note);
}

function init() {
  createKeyboard();
  volumeValue.textContent = `${Math.round(Number.parseFloat(volumeSlider.value) * 100)}%`;
  renderRecordedEvents();
  updateControls();
  setStatus("Ready to play.");
}

recordButton.addEventListener("click", () => {
  if (!isRecording && !isPlaying) {
    startRecording();
  }
});

stopButton.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  }
  if (isPlaying) {
    stopPlayback();
    setStatus("Playback stopped.");
  }
});

playButton.addEventListener("click", () => {
  if (!isRecording) {
    startPlayback();
  }
});

clearButton.addEventListener("click", () => {
  if (!isRecording) {
    clearRecording();
  }
});

exportButton.addEventListener("click", () => exportRecording());

volumeSlider.addEventListener("input", () => {
  const value = Number.parseFloat(volumeSlider.value);
  volumeValue.textContent = `${Math.round(value * 100)}%`;
  if (masterGain) {
    const context = getAudioContext();
    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.setTargetAtTime(value, context.currentTime, 0.05);
  }
});

waveformSelect.addEventListener("change", () => {
  currentWaveform = waveformSelect.value;
  setStatus(`Waveform set to ${currentWaveform}.`);
});

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", () => {
  Array.from(activeUserVoices.keys()).forEach((note) => stopUserNote(note));
});

window.addEventListener("beforeunload", () => {
  clearPlaybackSchedule();
  stopPlaybackVoices();
});

document.addEventListener("DOMContentLoaded", init);
