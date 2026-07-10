import {
  REQUIRED_MODEL_NAME,
  type OllamaSystemStatus,
} from "../services/ollama";
import "./SetupPanel.css";

type SetupPanelProps = {
  systemStatus: OllamaSystemStatus;
  onRetry: () => Promise<OllamaSystemStatus>;
};

function SetupPanel({
  systemStatus,
  onRetry,
}: SetupPanelProps) {
  const isChecking =
    systemStatus.status === "checking";

  const isOllamaOffline =
    systemStatus.status === "offline";

  const isModelMissing =
    systemStatus.status === "model-missing";

  const handleRetry = () => {
    void onRetry();
  };

  return (
    <div className="setup-backdrop">
      <section
        className="setup-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <header className="setup-header">
          <span className="setup-eyebrow">
            Cognitive System Setup
          </span>

          <h2 id="setup-title">
            {isChecking
              ? "Checking Local AI System"
              : isOllamaOffline
                ? "Ollama Connection Required"
                : "Amadeus Model Required"}
          </h2>

          <p>
            {isChecking
              ? "Amadeus is checking the local cognitive system."
              : isOllamaOffline
                ? "Amadeus could not connect to the local Ollama service."
                : `Ollama is online, but the required ${REQUIRED_MODEL_NAME} model was not found.`}
          </p>
        </header>

        <div className="setup-content">
          <div className="setup-status-grid">
            <div className="setup-status-item">
              <span>Ollama</span>

              <strong
                className={
                  systemStatus.ollamaOnline
                    ? "setup-ready"
                    : "setup-unavailable"
                }
              >
                {isChecking
                  ? "Checking..."
                  : systemStatus.ollamaOnline
                    ? "Online"
                    : "Unavailable"}
              </strong>
            </div>

            <div className="setup-status-item">
              <span>Required Model</span>

              <strong
                className={
                  systemStatus.modelAvailable
                    ? "setup-ready"
                    : "setup-unavailable"
                }
              >
                {isChecking
                  ? "Checking..."
                  : systemStatus.modelAvailable
                    ? "Available"
                    : "Missing"}
              </strong>
            </div>
          </div>

          {isOllamaOffline && (
            <div className="setup-instructions">
              <h3>Start the local AI service</h3>

              <p>
                Ollama must be installed and running
                before Amadeus can respond.
              </p>

              <p>
                Start Ollama, wait a few seconds, then
                select Retry System Check.
              </p>

              <code>ollama serve</code>
            </div>
          )}

          {isModelMissing && (
            <div className="setup-instructions">
              <h3>Restore the required model</h3>

              <p>
                Amadeus expects this local Ollama model:
              </p>

              <code>{REQUIRED_MODEL_NAME}</code>

              <p>
                Create the model using the Amadeus
                Modelfile, then retry the system check.
              </p>
            </div>
          )}

          {!isChecking && (
            <button
              className="setup-retry-button"
              type="button"
              onClick={handleRetry}
            >
              Retry System Check
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export default SetupPanel;