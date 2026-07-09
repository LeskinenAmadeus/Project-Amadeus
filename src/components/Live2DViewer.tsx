import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display/cubism4";

declare global {
  interface Window {
    PIXI: typeof PIXI;
  }
}

window.PIXI = PIXI;
Live2DModel.registerTicker(PIXI.Ticker);

function Live2DViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let app: PIXI.Application | null = null;
    let model: Live2DModel | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let destroyed = false;

    const fitModelToContainer = () => {
        if (!app || !model || !containerRef.current) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        app.renderer.resize(width, height);

        // Responsive zoom level.
        // Larger number = smaller model / more body visible.
         // Smaller number = larger model / closer face crop.
        const isCompact = width < 520 || height < 520;

        const scale = isCompact
            ? height / 900
            : height / 1200;

        model.scale.set(scale);

        // Center horizontally.
        model.x = width / 2;

        // Move the model down or up depending on available height.
        // Smaller value moves the model upward.
        model.y = isCompact
            ? height * 2.4
            : height * 2;
        };

    const loadModel = async () => {
      if (!containerRef.current) return;

      app = new PIXI.Application({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: true,
      });

      containerRef.current.appendChild(app.view);

      try {
        model = await Live2DModel.from("/live2d/Kurisu/Kurisu.model3.json", {
          autoInteract: false,
        });

        if (destroyed || !app || !model) return;

        model.anchor.set(0.5, 0.5);

        app.stage.addChild(model);

        fitModelToContainer();

        resizeObserver = new ResizeObserver(() => {
          fitModelToContainer();
        });

        resizeObserver.observe(containerRef.current);
      } catch (error) {
        console.error("Failed to load Live2D model:", error);
      }
    };

    loadModel();

    return () => {
      destroyed = true;
      resizeObserver?.disconnect();
      model?.destroy();
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, []);

  return <div ref={containerRef} className="live2d-container" />;
}

export default Live2DViewer;