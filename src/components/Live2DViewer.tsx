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

const EXPRESSIONS = [
  "Arm Change",
  "Blush 1",
  "Blush 2",
  "Stanby Angry",
  "Stanby Sad",
  "Stanby Scared",
  "Stanby Smile",
  "Stanby Surprised",
];

const MOTIONS = [
  { label: "Idle Loop", group: "Idle", index: 0 },
  { label: "Head Movement", group: "TapHead", index: 0 },
  { label: "Sleepy", group: "TapBody", index: 0 },
  { label: "Focused Stare", group: "Special", index: 0 },
  { label: "Penguin Sway", group: "Special", index: 1 },
];

type Live2DViewerProps = {
  activeExpression: string | null;
};

function Live2DViewer({ activeExpression }: Live2DViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);

  const setExpression = (expressionName: string) => {
    const model = modelRef.current;
    if (!model) return;

    model.expression(expressionName);
  };

  const startMotion = (group: string, index: number) => {
  const model = modelRef.current;
  if (!model) return;

  model.motion(group, index);
};

  useEffect(() => {
    if (!activeExpression) return;
    setExpression(activeExpression);
  }, [activeExpression]);

  useEffect(() => {
    let app: PIXI.Application | null = null;
    let model: Live2DModel | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let destroyed = false;

    type FramingMode = "small" | "medium" | "large";

    const getFramingMode = (width: number, height: number): FramingMode => {
      if (width < 320 || height < 420) return "small";
      if (width < 520 || height < 620) return "medium";
      return "large";
    };

    const fitModelToContainer = () => {
      if (!app || !model || !containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      app.renderer.resize(width, height);

      const mode = getFramingMode(width, height);
      const isCompact = width < 520 || height < 520;

      const scale =
        mode === "small"
          ? height / 820
          : mode === "medium"
            ? height / 950
            : height / 1200;

      model.scale.set(scale);

      model.x =
        mode === "small"
          ? width * 0.52
          : mode === "medium"
            ? width * 0.5
            : width * 0.48;

      model.y =
        mode === "small"
          ? height * 2.5
          : isCompact
            ? height * 2.5
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

        modelRef.current = model;
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
      modelRef.current = null;
      model?.destroy();

      app?.destroy(true, {
        children: true,
        texture: true,
        baseTexture: true,
      });
    };
  }, []);

  return (
    <div className="live2d-viewer">
      <div ref={containerRef} className="live2d-container" />

      <div className="expression-controls">
        {EXPRESSIONS.map((expression) => (
          <button
            key={expression}
            type="button"
            onClick={() => setExpression(expression)}
          >
            {expression}
          </button>
        ))}
      </div>
      <div className="motion-controls">
        {MOTIONS.map((motion) => (
          <button
            key={motion.label}
            type="button"
            onClick={() => startMotion(motion.group, motion.index)}
           >
              {motion.label}
          </button>
         ))}
      </div>
    </div>
  );
}

export default Live2DViewer;