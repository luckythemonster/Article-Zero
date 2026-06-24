import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadAtlasFrames, _resetAtlasPromiseForTest } from './SpriteGallery';

describe('SpriteGallery', () => {
  describe('loadAtlasFrames', () => {
    let originalFetch: typeof globalThis.fetch;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      _resetAtlasPromiseForTest();
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      consoleErrorSpy.mockRestore();
    });

    it('returns an empty object and logs an error when fetch fails', async () => {
      // Mock fetch to reject
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await loadAtlasFrames();

      expect(globalThis.fetch).toHaveBeenCalledWith('/assets/sprite_pack/chars-art.json');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SpriteGallery] failed to load atlas JSON',
        expect.any(Error)
      );
      expect(result).toEqual({});
    });

    it('returns parsed frames on success', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          frames: {
            "test_frame": { frame: { x: 0, y: 0, w: 10, h: 10 } }
          }
        })
      }) as any;

      const result = await loadAtlasFrames();

      expect(globalThis.fetch).toHaveBeenCalledWith('/assets/sprite_pack/chars-art.json');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(result).toEqual({
        "test_frame": { x: 0, y: 0, w: 10, h: 10 }
      });
    });
  });
});
