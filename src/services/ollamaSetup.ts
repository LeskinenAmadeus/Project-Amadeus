import { invoke } from "@tauri-apps/api/core";

export async function isOllamaInstalled(): Promise<boolean> {
  return invoke<boolean>("is_ollama_installed");
}

export async function installOllama(): Promise<string> {
  return invoke<string>("install_ollama");
}

export async function startOllama(): Promise<string> {
  return invoke<string>("start_ollama");
}

export async function createAmadeusModel(): Promise<string> {
  return invoke<string>("create_amadeus_model");
}

export function getSetupErrorMessage(
  error: unknown
): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The setup operation failed unexpectedly.";
}