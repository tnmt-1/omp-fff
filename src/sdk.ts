import type { FileFinderApi, InitOptions, Result } from "@ff-labs/fff-bun";

export const SCAN_TIMEOUT_MS = 15_000;

/** omp runs on Bun, so the SDK is always the bun binding. */
export type FileFinderStatic = {
  create(options: InitOptions): Result<FileFinderApi>;
};

let sdkPromise: Promise<{ FileFinder: FileFinderStatic }> | null = null;

export function loadSdk(): Promise<{ FileFinder: FileFinderStatic }> {
  if (sdkPromise) return sdkPromise;

  // omp reloads extension modules with a fresh module graph on /reload.
  // Re-importing the fff-bun module graph (which top-level awaits a
  // `type: "file"` import of the native dylib) hangs forever inside the
  // Bun-compiled omp binary, so cache the first import on globalThis and
  // reuse it across reloads.
  const g = globalThis as Record<string, unknown>;
  if (g.__fffSdkPromiseGlobal) {
    sdkPromise = g.__fffSdkPromiseGlobal as Promise<{ FileFinder: FileFinderStatic }>;
    return sdkPromise;
  }

  // omp's legacy-pi loader rewrites extension import specifiers to absolute
  // paths at load time (the compiled binary cannot resolve node_modules at
  // runtime), and that rewrite only applies to string-literal specifiers.
  // A variable `import(pkg)` therefore fails under omp.
  const p = import("@ff-labs/fff-bun") as Promise<{ FileFinder: FileFinderStatic }>;
  sdkPromise = p;
  (globalThis as Record<string, unknown>).__fffSdkPromiseGlobal = p;
  return p;
}
