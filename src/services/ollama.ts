import type { Message } from "../types/message";

const OLLAMA_URL = "http://localhost:11434/api/chat";

type OllamaMessage = {
  role: "user" | "assistant";
  content: string;
};

function convertMessages(messages: Message[]): OllamaMessage[] {
  return messages
    .filter((message) => !message.text.includes("AMADEUS cognitive interface initialized."))
    .filter((message) => !message.text.includes("Local systems are online."))
    .map((message) => ({
      role: message.sender === "user" ? "user" : "assistant",
      content: message.text,
    }));
}

export async function sendMessage(messages: Message[]) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "amadeus-kurisu",
      messages: convertMessages(messages),
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  return await response.json();
}