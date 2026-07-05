// usePerfProbe — useFrame hook that samples frame times for 10s, then logs
// avg + 1%-low fps and exposes the result on window.__perf for gate capture.
// Replaces stats-gl (broken on WebGPURenderer r181+, per spec Task 2 Step 4).
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

type PerfSample = { label: string; avgFps: number; p1Fps: number; frames: number };

export function usePerfProbe(label: string) {
  const frames = useRef(0);
  const elapsed = useRef(0);
  const dts = useRef<number[]>([]);
  const done = useRef(false);

  useFrame((_, dt) => {
    if (done.current) return; // one 10s sample per mount — no console spam
    frames.current += 1;
    elapsed.current += dt;
    dts.current.push(dt);

    if (elapsed.current >= 10) {
      done.current = true;
      const avgFps = frames.current / elapsed.current;
      // 1% low = fps of the mean of the slowest 1% of frame times.
      const sorted = [...dts.current].sort((a, b) => a - b);
      const n = Math.max(1, Math.floor(sorted.length * 0.01));
      const slowest = sorted.slice(-n);
      const p1Fps = 1 / (slowest.reduce((s, v) => s + v, 0) / slowest.length);
      const sample: PerfSample = { label, avgFps, p1Fps, frames: frames.current };
      // eslint-disable-next-line no-console
      console.table({ [label]: sample });
      (window as any).__perf = sample;
    }
  });
}
