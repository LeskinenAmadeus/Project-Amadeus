import type {
  AppSettings,
  ResponseSpeed,
} from "../types/settings";
import "./SettingsPanel.css";

type SettingsPanelProps = {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onClose: () => void;
};

function SettingsPanel({
  settings,
  onSettingsChange,
  onClose,
}: SettingsPanelProps) {
  const updateResponseSpeed = (
    responseSpeed: ResponseSpeed
  ) => {
    onSettingsChange({
      ...settings,
      responseSpeed,
    });
  };

  const updateAutoScroll = (autoScroll: boolean) => {
    onSettingsChange({
      ...settings,
      autoScroll,
    });
  };

  const updateConversationSaving = (
    saveConversationHistory: boolean
  ) => {
    onSettingsChange({
      ...settings,
      saveConversationHistory,
    });
  };

  return (
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div>
            <span className="settings-eyebrow">
              System Configuration
            </span>

            <h2 id="settings-title">
              Amadeus Settings
            </h2>
          </div>

          <button
            className="settings-close-button"
            type="button"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <div className="settings-content">
          <label className="settings-field">
            <span className="settings-field-title">
              Response display speed
            </span>

            <span className="settings-field-description">
              Controls how quickly streamed response text
              appears in the conversation.
            </span>

            <select
              value={settings.responseSpeed}
              onChange={(event) =>
                updateResponseSpeed(
                  event.target.value as ResponseSpeed
                )
              }
            >
              <option value="instant">
                Instant
              </option>

              <option value="standard">
                Standard
              </option>

              <option value="deliberate">
                Deliberate
              </option>
            </select>
          </label>

          <label className="settings-toggle-row">
            <div>
              <span className="settings-field-title">
                Auto-scroll conversation
              </span>

              <span className="settings-field-description">
                Keep the newest response visible while
                Amadeus is speaking.
              </span>
            </div>

            <input
              type="checkbox"
              checked={settings.autoScroll}
              onChange={(event) =>
                updateAutoScroll(event.target.checked)
              }
            />
          </label>

          <label className="settings-toggle-row">
            <div>
              <span className="settings-field-title">
                Save conversation history
              </span>

              <span className="settings-field-description">
                Save new conversation changes to this
                computer.
              </span>
            </div>

            <input
              type="checkbox"
              checked={
                settings.saveConversationHistory
              }
              onChange={(event) =>
                updateConversationSaving(
                  event.target.checked
                )
              }
            />
          </label>

          <div className="settings-note">
            Disabling conversation history prevents future
            changes from being saved. It does not delete
            history that was already stored.
          </div>
        </div>

        <footer className="settings-footer">
          <button
            type="button"
            className="settings-done-button"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export default SettingsPanel;