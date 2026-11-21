export type EventSound = "chime" | "bell" | "off";
let context: AudioContext | null = null;
let nodes: OscillatorNode[] = [];
let playback = 0;

export async function unlockEventAudio() {
  context ??= new AudioContext();
  if (context.state === "suspended") await context.resume();
  if (context.state !== "running") throw new Error("Event audio is unavailable");
}

export function stopEventAudio() {
  playback++;
  for (const node of nodes) { node.stop(); node.disconnect(); }
  nodes = [];
}

export async function playEventAudio(sound: EventSound, seconds: number) {
  stopEventAudio();
  const request = playback;
  if (sound === "off") return;
  await unlockEventAudio();
  if (request !== playback) return;
  const audio = context!;
  for (let beat = 0; beat < seconds; beat += 2) {
    for (const [index, frequency] of (sound === "chime" ? [660, 880] : [523, 1046]).entries()) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + beat + index * 0.18;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); nodes = nodes.filter((node) => node !== oscillator); };
      oscillator.start(start);
      oscillator.stop(start + 0.7);
      nodes.push(oscillator);
    }
  }
}
