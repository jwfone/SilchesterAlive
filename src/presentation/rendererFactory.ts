import * as THREE from 'three';

export interface RenderAdapter {
  backend: 'webgpu' | 'webgl2';
  domElement: HTMLCanvasElement;
  setSize(w: number, h: number): void;
  setPixelRatio(dpr: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void | Promise<void>;
  setAnimationLoop(cb: ((time: number) => void) | null): void;
  drawCalls(): number;
  triangles(): number;
  /** The underlying WebGL2 renderer (absent on the experimental WebGPU path). */
  webgl?: THREE.WebGLRenderer;
}

// Renderer factory: WebGPU first (modern browsers), WebGL2 fallback.
// Keeps Game code backend-agnostic for future extension.
export async function createRenderer(dpr: number, preferWebGPU: boolean): Promise<RenderAdapter> {
  if (preferWebGPU) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wgpu = (await import('three/webgpu')) as any;
      if (wgpu?.WebGPURenderer) {
        const r = new wgpu.WebGPURenderer({ antialias: true }) as THREE.WebGLRenderer & {
          init?: () => Promise<void>;
          renderAsync?: (s: THREE.Scene, c: THREE.Camera) => Promise<void>;
        };
        if (r.init) await r.init();
        r.setPixelRatio(Math.min(dpr, 2));
        r.setSize(window.innerWidth, window.innerHeight);
        return {
          backend: 'webgpu',
          domElement: r.domElement,
          setSize: (w, h) => r.setSize(w, h),
          setPixelRatio: d => r.setPixelRatio(d),
          render: (s, c) => (r.renderAsync ? r.renderAsync(s, c) : r.render(s, c)),
          setAnimationLoop: cb => r.setAnimationLoop(cb),
          drawCalls: () => r.info.render.calls,
          triangles: () => r.info.render.triangles,
        };
      }
    } catch {
      // fall through to WebGL2
    }
  }
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(dpr, 2));
  r.setSize(window.innerWidth, window.innerHeight);
  return {
    backend: 'webgl2',
    domElement: r.domElement,
    setSize: (w, h) => r.setSize(w, h),
    setPixelRatio: d => r.setPixelRatio(d),
    render: (s, c) => r.render(s, c),
    setAnimationLoop: cb => r.setAnimationLoop(cb),
    drawCalls: () => r.info.render.calls,
    triangles: () => r.info.render.triangles,
    webgl: r,
  };
}
