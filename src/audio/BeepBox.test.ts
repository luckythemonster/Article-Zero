import { describe, it, expect, vi, beforeEach } from "vitest";
import { BeepBoxPlayer, loadAndCreate } from "./BeepBox";
import { Song, Synth } from "beepbox";
import * as audioContextModule from "./audio-context";

vi.mock("beepbox", () => {
  class SynthMock {
    loopRepeatCount = 0;
    volume = 0;
    playing = false;
    play = vi.fn();
    pause = vi.fn();
    snapToStart = vi.fn();
  }

  class SongMock {
    fromJsonObject = vi.fn();
  }

  return {
    Synth: SynthMock,
    Song: SongMock,
  };
});

vi.mock("./audio-context", () => ({
  getSharedContext: vi.fn(),
}));

describe("BeepBoxPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scriptNode.disconnect error handling", () => {
    it("should safely catch error on scriptNode.disconnect() inside deactivateAudio", () => {
      const mockContext = { state: "running" } as unknown as AudioContext;
      vi.mocked(audioContextModule.getSharedContext).mockReturnValue(mockContext);

      const song = new Song();
      const player = new BeepBoxPlayer(song);

      // After construction, the player overrides `deactivateAudio`
      // Type assertion avoids TS errors for private members
      const synthInternal = (player as unknown as { synth: { deactivateAudio: () => void, scriptNode: unknown } }).synth;
      expect(synthInternal.deactivateAudio).toBeDefined();

      // Mock a scriptNode that throws on disconnect
      const mockScriptNode = {
        disconnect: vi.fn().mockImplementation(() => {
          throw new Error("Simulated disconnect error");
        }),
      };
      synthInternal.scriptNode = mockScriptNode;

      // Call the overridden deactivateAudio
      expect(() => synthInternal.deactivateAudio()).not.toThrow();
      expect(mockScriptNode.disconnect).toHaveBeenCalled();
      // Verify scriptNode was cleared even though it threw
      expect(synthInternal.scriptNode).toBeNull();
    });
  });

  describe("dispose error handling", () => {
    it("should safely catch error on synth.pause() during dispose", () => {
      const song = new Song();
      const player = new BeepBoxPlayer(song);

      const synthInternal = (player as unknown as { synth: Synth }).synth;
      synthInternal.pause = vi.fn().mockImplementation(() => {
        throw new Error("Simulated pause error");
      });

      expect(() => player.dispose()).not.toThrow();
      expect(synthInternal.pause).toHaveBeenCalled();
    });
  });

  describe("loadAndCreate fetch error handling", () => {
    it("should throw on fetch failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(loadAndCreate("/fake/url.json")).rejects.toThrow("fetch /fake/url.json failed: 404");
    });

    it("should throw on invalid format", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ format: "Invalid" }),
      });

      await expect(loadAndCreate("/fake/url.json")).rejects.toThrow("not a BeepBox file: format=Invalid");
    });

    it("should resolve on valid file", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ format: "BeepBox" }),
      });

      const player = await loadAndCreate("/fake/url.json");
      expect(player).toBeInstanceOf(BeepBoxPlayer);
    });
  });
});
