// Capability gate + quality tiers. Pure logic (testable), no renderer import.
export interface QualityTier {
  backend: 'webgpu' | 'webgl2';
  dpr: number;
  shadows: boolean;
  fogFar: number;
}

export function decideRenderMode(opts: {
  hasWebGPU: boolean;
  deviceMemoryGB?: number;
  hardwareConcurrency?: number;
}): QualityTier {
  void opts;
  // WebGL2 default for everyone: the WebGPU path cost an extra ~705 KB chunk
  // plus 25% more pixels for output identical to this tier (shadows were never
  // enabled — Game keeps sun.castShadow false — so the only deltas were DPR
  // and fog distance, both matched here: dpr 1.25, fogFar 900). WebGPU remains
  // available for experiments via ?webgpu (see Game init); that opt-in is the
  // only path that downloads the three/webgpu chunk.
  return { backend: 'webgl2', dpr: 1.25, shadows: false, fogFar: 900 };
}

export function detectCapabilities(): { hasWebGPU: boolean; deviceMemoryGB?: number; hardwareConcurrency?: number } {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hasWebGPU: typeof (navigator as any).gpu !== 'undefined',
    deviceMemoryGB: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}
