
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sfx } from './Sfx';
import * as audioContextModule from './audio-context';

vi.mock('./audio-context', () => ({
  getSharedContext: vi.fn(),
}));

describe('Sfx loadWavBuffer edge cases', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockContext: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    mockContext = {
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
      }),
      destination: {},
      decodeAudioData: vi.fn(),
    };
    vi.mocked(audioContextModule.getSharedContext).mockReturnValue(mockContext);

    // Reset Sfx singleton state using a workaround
    const sfxAny = sfx as any;
    sfxAny.ctx = null;
    sfxAny.master = null;
    sfxAny.wavIndex = null;
    sfxAny.wavIndexLoaded = false;
    sfxAny.wavIndexLoading = null;
    sfxAny.wavBuffers = new Map();
    sfxAny.wavPending = new Map();
    sfxAny.wavLastError = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('handles fetch returning non-ok status', async () => {
    const sfxAny = sfx as any;

    // Call ensure to set up ctx so loadWavBuffer doesn't early-exit
    sfxAny.ensure();

    // Mock fetch to return a 404 response
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const entry = { name: 'test_glitch', file: '/sfx/test.wav', defaultVolume: 1, loop: false };

    const result = await sfxAny.loadWavBuffer(entry);

    expect(result).toBeNull();
    expect(sfxAny.wavLastError).toBe('fetch /sfx/test.wav → 404');
    expect(sfxAny.wavPending.has(entry.name)).toBe(false);
  });

  it('handles fetch throwing an error', async () => {
    const sfxAny = sfx as any;
    sfxAny.ensure();

    // Mock fetch to throw a network error
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network disconnected'));

    const entry = { name: 'test_glitch', file: '/sfx/test.wav', defaultVolume: 1, loop: false };

    const result = await sfxAny.loadWavBuffer(entry);

    expect(result).toBeNull();
    expect(sfxAny.wavLastError).toBe('/sfx/test.wav: Network disconnected');
    expect(sfxAny.wavPending.has(entry.name)).toBe(false);
  });

  it('handles decodeAudioData throwing an error', async () => {
    const sfxAny = sfx as any;
    sfxAny.ensure();

    // Mock fetch to succeed
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(8)),
    } as unknown as Response);

    // Mock decodeAudioData to throw
    mockContext.decodeAudioData.mockRejectedValueOnce(new Error('Invalid audio data'));

    const entry = { name: 'test_glitch', file: '/sfx/test.wav', defaultVolume: 1, loop: false };

    const result = await sfxAny.loadWavBuffer(entry);

    expect(result).toBeNull();
    expect(sfxAny.wavLastError).toBe('/sfx/test.wav: Invalid audio data');
    expect(sfxAny.wavPending.has(entry.name)).toBe(false);
  });
});

describe('Sfx deferredLoop edge cases', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockContext: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    mockContext = {
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
      }),
      destination: {},
      decodeAudioData: vi.fn(),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn()
      }),
    };
    vi.mocked(audioContextModule.getSharedContext).mockReturnValue(mockContext);

    // Reset Sfx singleton state using a workaround
    const sfxAny = sfx as any;
    sfxAny.ctx = null;
    sfxAny.master = null;
    sfxAny.wavIndex = null;
    sfxAny.wavIndexLoaded = false;
    sfxAny.wavIndexLoading = null;
    sfxAny.wavBuffers = new Map();
    sfxAny.wavPending = new Map();
    sfxAny.wavLastError = null;
    sfxAny.loaded = false;
    sfxAny.buffers = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('cancels deferred loop before load completes', async () => {
    const sfxAny = sfx as any;
    sfxAny.ensure();

    const entry = { name: 'test_loop', file: '/sfx/test.wav', defaultVolume: 1, loop: true };
    sfxAny.wavIndex = { 'test_loop': entry };
    sfxAny.wavIndexLoaded = true;

    // fetch will be "pending"
    let resolveFetch: any;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.mocked(globalThis.fetch).mockReturnValueOnce(fetchPromise as unknown as Promise<Response>);

    const handle = sfxAny.playWav('test_loop', { loop: true });

    // Stop immediately
    handle.stop();

    // Now resolve fetch
    resolveFetch({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(8)),
    });
    mockContext.decodeAudioData.mockResolvedValueOnce({} as AudioBuffer);

    // Give microtasks time to run
    await new Promise(r => setTimeout(r, 0));

    expect(mockContext.createBufferSource).not.toHaveBeenCalled();
  });
});

describe('Sfx general edge cases', () => {
  let originalFetch: typeof globalThis.fetch;
  let mockContext: any;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();

    mockContext = {
      createGain: vi.fn().mockReturnValue({
        gain: { value: 0 },
        connect: vi.fn(),
      }),
      destination: {},
      decodeAudioData: vi.fn(),
      createBufferSource: vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        loop: false,
      }),
    };
    vi.mocked(audioContextModule.getSharedContext).mockReturnValue(mockContext);

    // Reset Sfx singleton state using a workaround
    const sfxAny = sfx as any;
    sfxAny.ctx = null;
    sfxAny.master = null;
    sfxAny.wavIndex = null;
    sfxAny.wavIndexLoaded = false;
    sfxAny.wavIndexLoading = null;
    sfxAny.wavBuffers = new Map();
    sfxAny.wavPending = new Map();
    sfxAny.wavLastError = null;
    sfxAny.loaded = false;
    sfxAny.buffers = null;
    sfxAny.activeLoops = 0;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('safely handles stop() being called multiple times', () => {
    const sfxAny = sfx as any;
    sfxAny.ensure();

    const entry = { name: 'test_loop', file: '/sfx/test.wav', defaultVolume: 1, loop: true };
    const buf = {} as AudioBuffer;

    // fireWav directly
    const handle = sfxAny.fireWav(entry, buf, { loop: true });

    expect(sfxAny.activeLoops).toBe(1);

    // First stop
    handle.stop();
    expect(sfxAny.activeLoops).toBe(0);

    // Second stop should be a no-op and not throw
    expect(() => handle.stop()).not.toThrow();
    expect(sfxAny.activeLoops).toBe(0);
  });

  it('safely handles stop() when src.stop() throws', () => {
    const sfxAny = sfx as any;
    sfxAny.ensure();

    const entry = { name: 'test_loop', file: '/sfx/test.wav', defaultVolume: 1, loop: true };
    const buf = {} as AudioBuffer;

    const mockSrc = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn().mockImplementation(() => { throw new Error('already stopped'); }),
      disconnect: vi.fn(),
      loop: false,
    };
    mockContext.createBufferSource.mockReturnValueOnce(mockSrc);

    // fireWav directly
    const handle = sfxAny.fireWav(entry, buf, { loop: true });

    expect(sfxAny.activeLoops).toBe(1);

    // First stop should catch the error and continue
    expect(() => handle.stop()).not.toThrow();
    expect(sfxAny.activeLoops).toBe(0);
    // disconnect should still have been called
    expect(mockSrc.disconnect).toHaveBeenCalled();
  });

  it('safely handles stop() when disconnect throws', () => {
    const sfxAny = sfx as any;
    sfxAny.ensure();

    const entry = { name: 'test_loop', file: '/sfx/test.wav', defaultVolume: 1, loop: true };
    const buf = {} as AudioBuffer;

    const mockSrc = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn().mockImplementation(() => { throw new Error('noop error'); }),
      loop: false,
    };
    mockContext.createBufferSource.mockReturnValueOnce(mockSrc);

    const mockGain = {
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn().mockImplementation(() => { throw new Error('noop error'); }),
    };
    mockContext.createGain.mockReturnValue(mockGain);

    // fireWav directly
    const handle = sfxAny.fireWav(entry, buf, { loop: true });

    expect(sfxAny.activeLoops).toBe(1);

    // First stop should catch the error and continue
    expect(() => handle.stop()).not.toThrow();
    expect(sfxAny.activeLoops).toBe(0);
  });
});
