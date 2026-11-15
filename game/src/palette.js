// The look plan, in one place: night shift over an industrial yard. The
// fps-02 build pushes the dusk of the first yard into full night — a deeper
// blue-black sky, lamps that actually pool light, and site beacons that pulse
// so a player can read, at a glance, which site is live. Six colours carry
// the whole game — warm amber for Vanguard and the spike, cool teal for
// Sentinel, dark blue-grey for the yard itself. The same names are the CSS
// custom properties in index.html, so the HUD and the 3D scene can never
// drift apart.
export const PALETTE = {
  canvas: '#0e1219',
  surface: '#1e242f',
  wall: '#2e3540',
  crate: '#5d4a33',
  container: '#315e66',
  ink: '#ece7dc',
  muted: '#8b94a0',
  accent: '#ffb02e',
  teal: '#2fd3c4',
  danger: '#e0483e',
  health: '#7fc76a',
  bg: '#243242',
  gunmetal: '#333a45',
  beacon: '#ffcf5c',
  night: '#0e1424',
};
