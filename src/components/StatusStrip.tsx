import type {
  OllamaSystemStatus,
} from "../services/ollama";

type StatusStripProps = {
  loading: boolean;
  systemStatus: OllamaSystemStatus;
};

function StatusStrip({
  loading,
  systemStatus,
}: StatusStripProps) {
  const getBrainStatus = () => {
    if (loading) {
      return "Thinking";
    }

    switch (systemStatus.status) {
      case "checking":
        return "Checking";

      case "ready":
        return "Online";

      case "model-missing":
        return "Model Missing";

      case "offline":
      default:
        return "Offline";
    }
  };

  const getModelStatus = () => {
    switch (systemStatus.status) {
      case "checking":
        return "Checking";

      case "ready":
        return "amadeus-kurisu";

      case "model-missing":
        return "Missing";

      case "offline":
      default:
        return "Unavailable";
    }
  };

  return (
    <section className="status-strip">
      <span>
        Brain: {getBrainStatus()}
      </span>

      <span>Memory: Local</span>

      <span>Voice: Offline</span>

      <span>Live2D: Active</span>

      <span>
        Model: {getModelStatus()}
      </span>
    </section>
  );
}

export default StatusStrip;