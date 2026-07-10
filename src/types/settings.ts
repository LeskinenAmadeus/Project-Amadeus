export type ResponseSpeed =
  | "instant"
  | "standard"
  | "deliberate";

export interface AppSettings {
  responseSpeed: ResponseSpeed;
  autoScroll: boolean;
  saveConversationHistory: boolean;
}