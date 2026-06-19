import React, { useEffect, useRef } from "react";
import { Phaser } from "../engine/EngineAdapter";
import { TitleScene } from "../phaser/TitleScene";

export const PhaserTitleCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: containerRef.current,
      width: 1280,
      height: 720,
      transparent: true,
      scene: [TitleScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none", // let clicks pass through to the React UI buttons
        zIndex: 0,
      }}
    />
  );
};
