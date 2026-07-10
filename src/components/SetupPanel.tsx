import {
  useEffect,
  useState,
} from "react";
import {
  REQUIRED_MODEL_NAME,
  type OllamaSystemStatus,
} from "../services/ollama";
import {
  createAmadeusModel,
  getSetupErrorMessage,
  installOllama,
  isOllamaInstalled,
  startOllama,
} from "../services/ollamaSetup";
import "./SetupPanel.css";

type SetupPanelProps = {
  systemStatus: OllamaSystemStatus;
  onRetry: () => Promise<OllamaSystemStatus>;
};

type SetupOperation =
  | "checking-installation"
  | "installing"
  | "starting"
  | "creating-model"
  | null;

function SetupPanel({
  systemStatus,
  onRetry,
}: SetupPanelProps) {
  const [ollamaInstalled, setOllamaInstalled] =
    useState<boolean | null>(null);

  const [operation, setOperation] =
    useState<SetupOperation>(
      "checking-installation"
    );

  const [operationMessage, setOperationMessage] =
    useState<string | null>(null);

  const [setupError, setSetupError] =
    useState<string | null>(null);

  const isChecking =
    systemStatus.status === "checking";

  const isOllamaOffline =
    systemStatus.status === "offline";

  const isModelMissing =
    systemStatus.status === "model-missing";

  const operationRunning =
    operation !== null;

  const refreshInstallationState =
    async () => {
      setOperation("checking-installation");

      try {
        const installed =
          await isOllamaInstalled();

        setOllamaInstalled(installed);
      } catch (error: unknown) {
        console.error(
          "Unable to check the Ollama installation:",
          error
        );

        setOllamaInstalled(false);
      } finally {
        setOperation(null);
      }
    };

  useEffect(() => {
    void refreshInstallationState();
  }, [systemStatus.status]);

  const handleRetry = async () => {
    setSetupError(null);
    setOperationMessage(
      "Checking the local cognitive system..."
    );

    try {
      await onRetry();
    } finally {
      setOperationMessage(null);
    }
  };

  const handleInstall = async () => {
    setSetupError(null);
    setOperation("installing");

    setOperationMessage(
      "Installing Ollama. This may take several minutes..."
    );

    try {
      await installOllama();

      setOllamaInstalled(true);

      setOperation("starting");
      setOperationMessage(
        "Starting the local Ollama service..."
      );

      await startOllama();

      setOperationMessage(
        "Checking the Ollama connection..."
      );

      await onRetry();
    } catch (error: unknown) {
      console.error(
        "Ollama installation failed:",
        error
      );

      setSetupError(
        getSetupErrorMessage(error)
      );
    } finally {
      setOperation(null);
      setOperationMessage(null);
    }
  };

  const handleStart = async () => {
    setSetupError(null);
    setOperation("starting");

    setOperationMessage(
      "Starting the local Ollama service..."
    );

    try {
      await startOllama();

      setOperationMessage(
        "Checking the Ollama connection..."
      );

      await onRetry();
    } catch (error: unknown) {
      console.error(
        "Unable to start Ollama:",
        error
      );

      setSetupError(
        getSetupErrorMessage(error)
      );
    } finally {
      setOperation(null);
      setOperationMessage(null);
    }
  };

  const handleCreateModel = async () => {
    setSetupError(null);
    setOperation("creating-model");

    setOperationMessage(
      "Downloading llama3.1:8b and creating the Amadeus model. This can take several minutes and requires several gigabytes of disk space."
    );

    try {
      await createAmadeusModel();

      setOperationMessage(
        "Verifying the Amadeus model..."
      );

      await onRetry();
    } catch (error: unknown) {
      console.error(
        "Unable to create the Amadeus model:",
        error
      );

      setSetupError(
        getSetupErrorMessage(error)
      );
    } finally {
      setOperation(null);
      setOperationMessage(null);
    }
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
                ? ollamaInstalled
                  ? "Ollama appears to be installed, but its local service is not responding."
                  : "Ollama must be installed before Amadeus can run locally."
                : `Ollama is online, but the required ${REQUIRED_MODEL_NAME} model was not found.`}
          </p>
        </header>

        <div className="setup-content">
          <div className="setup-status-grid">
            <div className="setup-status-item">
              <span>Ollama Installation</span>

              <strong
                className={
                  ollamaInstalled
                    ? "setup-ready"
                    : "setup-unavailable"
                }
              >
                {ollamaInstalled === null
                  ? "Checking..."
                  : ollamaInstalled
                    ? "Installed"
                    : "Not Found"}
              </strong>
            </div>

            <div className="setup-status-item">
              <span>Ollama Service</span>

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
                    : "Offline"}
              </strong>
            </div>

            <div className="setup-status-item setup-status-wide">
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
                    ? REQUIRED_MODEL_NAME
                    : "Missing"}
              </strong>
            </div>
          </div>

          {isOllamaOffline && (
            <div className="setup-instructions">
              <h3>
                {ollamaInstalled
                  ? "Start Ollama"
                  : "Install Ollama"}
              </h3>

              <p>
                Amadeus uses Ollama to run the language
                model locally on this computer.
              </p>

              {!ollamaInstalled && (
                <p>
                  Selecting Install Ollama runs the
                  official Ollama Windows installation
                  script. The installation is started
                  only after you choose the button.
                </p>
              )}
            </div>
          )}

          {isModelMissing && (
            <div className="setup-instructions">
              <h3>Create the Amadeus model</h3>

              <p>
                The setup process will download:
              </p>

              <code>llama3.1:8b</code>

              <p>
                It will then create:
              </p>

              <code>{REQUIRED_MODEL_NAME}</code>

              <p>
                The download is several gigabytes and
                may take some time depending on the
                internet connection.
              </p>
            </div>
          )}

          {operationMessage && (
            <div
              className="setup-operation"
              role="status"
            >
              <span className="setup-spinner" />

              <span>{operationMessage}</span>
            </div>
          )}

          {setupError && (
            <div
              className="setup-error"
              role="alert"
            >
              <strong>Setup failed</strong>
              <p>{setupError}</p>
            </div>
          )}

          <div className="setup-actions">
            {!isChecking &&
              isOllamaOffline &&
              !ollamaInstalled && (
                <button
                  className="setup-primary-button"
                  type="button"
                  disabled={operationRunning}
                  onClick={() =>
                    void handleInstall()
                  }
                >
                  {operation === "installing"
                    ? "Installing..."
                    : "Install Ollama"}
                </button>
              )}

            {!isChecking &&
              isOllamaOffline &&
              ollamaInstalled && (
                <button
                  className="setup-primary-button"
                  type="button"
                  disabled={operationRunning}
                  onClick={() =>
                    void handleStart()
                  }
                >
                  {operation === "starting"
                    ? "Starting..."
                    : "Start Ollama"}
                </button>
              )}

            {!isChecking &&
              isModelMissing && (
                <button
                  className="setup-primary-button"
                  type="button"
                  disabled={operationRunning}
                  onClick={() =>
                    void handleCreateModel()
                  }
                >
                  {operation === "creating-model"
                    ? "Creating Model..."
                    : "Create Amadeus Model"}
                </button>
              )}

            {!isChecking && (
              <button
                className="setup-secondary-button"
                type="button"
                disabled={operationRunning}
                onClick={() =>
                  void handleRetry()
                }
              >
                Retry System Check
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default SetupPanel;