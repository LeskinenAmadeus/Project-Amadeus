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

    type FramingMode = "small" | "medium" | "large";

    const getFramingMode = (
      width: number,
      height: number
    ): FramingMode => {
      if (width < 320 || height < 420) {
        return "small";
      }

      if (width < 520 || height < 620) {
        return "medium";
      }

      return "large";
    };

    const fitModelToContainer = () => {
      if (!app || !model || !containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      app.renderer.resize(width, height);

      const mode = getFramingMode(width, height);
      const isCompact = width < 520 || height < 520;

      // Responsive zoom level:
      // Smaller divisor = larger model / closer face crop.
      // Larger divisor = smaller model / more body visible.
      const scale =
        mode === "small"
          ? height / 720
          : mode === "medium"
            ? height / 900
            : height / 1200;

      model.scale.set(scale);

      // Keep the model centered for small and medium framing.
      // Slightly shift it for the large/full-body view.
      model.x =
        mode === "large"
          ? width * 0.48
          : width / 2;

      // This specific Kurisu model has an unusual internal origin
      // and requires a large positive Y offset.
      // Do not replace these values with conventional offsets.
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
        model = await Live2DModel.from(
          "/live2d/Kurisu/Kurisu.model3.json",
          {
            autoInteract: false,
          }
        );

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

      app?.destroy(true, {
        children: true,
        texture: true,
        baseTexture: true,
      });
    };
  }, []);

  return <div ref={containerRef} className="live2d-container" />;
}

export default Live2DViewer;