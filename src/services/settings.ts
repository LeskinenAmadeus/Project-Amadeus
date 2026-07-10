import type {
  AppSettings,
  ResponseSpeed,
} from "../types/settings";

const SETTINGS_STORAGE_KEY = "amadeus-app-settings";

export const DEFAULT_SETTINGS: AppSettings = {
  responseSpeed: "standard",
  autoScroll: true,
  saveConversationHistory: true,
};

function isResponseSpeed(
  value: unknown
): value is ResponseSpeed {
  return (
    value === "instant" ||
    value === "standard" ||
    value === "deliberate"
  );
}

function isAppSettings(
  value: unknown
): value is AppSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const settings = value as Partial<AppSettings>;

  return (
    isResponseSpeed(settings.responseSpeed) &&
    typeof settings.autoScroll === "boolean" &&
    typeof settings.saveConversationHistory === "boolean"
  );
}

export function loadAppSettings(): AppSettings {
  try {
    const storedSettings =
      window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!storedSettings) {
      return DEFAULT_SETTINGS;
    }

    const parsedSettings: unknown =
      JSON.parse(storedSettings);

    if (!isAppSettings(parsedSettings)) {
      console.warn(
        "Saved settings used an unsupported structure. Default settings were restored."
      );

      return DEFAULT_SETTINGS;
    }

    return parsedSettings;
  } catch (error: unknown) {
    console.error(
      "Unable to load application settings:",
      error
    );

    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(
  settings: AppSettings
): void {
  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error: unknown) {
    console.error(
      "Unable to save application settings:",
      error
    );
  }
}

export function getResponseDelay(
  responseSpeed: ResponseSpeed
): number {
  switch (responseSpeed) {
    case "instant":
      return 0;

    case "deliberate":
      return 45;

    case "standard":
    default:
      return 18;
  }
}