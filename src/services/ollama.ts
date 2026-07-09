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

export async function streamMessage(
  messages: Message[],
  onToken: (token: string) => void
) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "amadeus-kurisu",
      messages: convertMessages(messages),
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to communicate with Ollama");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const parsed = JSON.parse(line);
      const token = parsed.message?.content || "";

      if (token) {
        onToken(token);
      }

      if (parsed.done) {
        return;
      }
    }
  }
}