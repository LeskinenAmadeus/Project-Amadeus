import type { Message } from "../types/message";

const OLLAMA_CHAT_URL =
  "http://localhost:11434/api/chat";

const OLLAMA_TAGS_URL =
  "http://localhost:11434/api/tags";

const STATUS_TIMEOUT_MS = 5000;
const CHAT_CONNECTION_TIMEOUT_MS = 15000;

export const REQUIRED_MODEL_NAME =
  "amadeus-kurisu";

const REQUIRED_MODEL_TAG =
  `${REQUIRED_MODEL_NAME}:latest`;

export type OllamaStatus =
  | "checking"
  | "offline"
  | "model-missing"
  | "ready";

export type OllamaSystemStatus = {
  status: OllamaStatus;
  ollamaOnline: boolean;
  modelAvailable: boolean;
};

export type OllamaErrorCode =
  | "offline"
  | "model-missing"
  | "request-failed"
  | "malformed-stream"
  | "empty-response"
  | "stream-interrupted"
  | "timeout";

export class OllamaRequestError extends Error {
  code: OllamaErrorCode;
  statusCode?: number;

  constructor(
    code: OllamaErrorCode,
    message: string,
    statusCode?: number
  ) {
    super(message);

    this.name = "OllamaRequestError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type OllamaMessage = {
  role: "user" | "assistant";
  content: string;
};

type OllamaModel = {
  name: string;
};

type OllamaTagsResponse = {
  models?: OllamaModel[];
};

type OllamaStreamResponse = {
  message?: {
    role?: string;
    content?: string;
  };
  done?: boolean;
  error?: string;
};

function convertMessages(
  messages: Message[]
): OllamaMessage[] {
  return messages
    .filter(
      (message) =>
        !message.text.includes(
          "AMADEUS cognitive interface initialized."
        )
    )
    .filter(
      (message) =>
        !message.text.includes(
          "Local systems are online."
        )
    )
    .filter(
      (message) => message.text.trim().length > 0
    )
    .map((message) => ({
      role:
        message.sender === "user"
          ? "user"
          : "assistant",
      content: message.text,
    }));
}

function modelExists(
  models: OllamaModel[] | undefined
): boolean {
  return (
    models?.some(
      (model) =>
        model.name === REQUIRED_MODEL_NAME ||
        model.name === REQUIRED_MODEL_TAG
    ) ?? false
  );
}

function createTimeoutController(
  timeoutMs: number,
  externalSignal?: AbortSignal
): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();

  const handleExternalAbort = () => {
    controller.abort(
      externalSignal?.reason ??
        new DOMException(
          "The request was stopped.",
          "AbortError"
        )
    );
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      handleExternalAbort();
    } else {
      externalSignal.addEventListener(
        "abort",
        handleExternalAbort,
        { once: true }
      );
    }
  }

  const timeoutId = window.setTimeout(() => {
    controller.abort(
      new DOMException(
        "The request timed out.",
        "TimeoutError"
      )
    );
  }, timeoutMs);

  return {
    controller,
    clear: () => {
      window.clearTimeout(timeoutId);

      externalSignal?.removeEventListener(
        "abort",
        handleExternalAbort
      );
    },
  };
}

function parseStreamLine(
  line: string
): OllamaStreamResponse {
  try {
    return JSON.parse(line) as OllamaStreamResponse;
  } catch {
    throw new OllamaRequestError(
      "malformed-stream",
      "Ollama returned malformed response data."
    );
  }
}

function detectRequestError(
  statusCode: number,
  responseText: string
): OllamaRequestError {
  const normalizedText =
    responseText.toLowerCase();

  if (
    statusCode === 404 ||
    normalizedText.includes("model") &&
      normalizedText.includes("not found")
  ) {
    return new OllamaRequestError(
      "model-missing",
      `The required Ollama model "${REQUIRED_MODEL_NAME}" was not found.`,
      statusCode
    );
  }

  return new OllamaRequestError(
    "request-failed",
    responseText.trim() ||
      `Ollama returned HTTP status ${statusCode}.`,
    statusCode
  );
}

export async function checkOllamaSystemStatus(): Promise<OllamaSystemStatus> {
  const { controller, clear } =
    createTimeoutController(STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(
      OLLAMA_TAGS_URL,
      {
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return {
        status: "offline",
        ollamaOnline: false,
        modelAvailable: false,
      };
    }

    const data =
      (await response.json()) as OllamaTagsResponse;

    if (!modelExists(data.models)) {
      return {
        status: "model-missing",
        ollamaOnline: true,
        modelAvailable: false,
      };
    }

    return {
      status: "ready",
      ollamaOnline: true,
      modelAvailable: true,
    };
  } catch {
    return {
      status: "offline",
      ollamaOnline: false,
      modelAvailable: false,
    };
  } finally {
    clear();
  }
}

export async function checkOllamaStatus(): Promise<boolean> {
  const systemStatus =
    await checkOllamaSystemStatus();

  return systemStatus.status === "ready";
}

export function getOllamaUserMessage(
  error: unknown
): string {
  if (!(error instanceof OllamaRequestError)) {
    return (
      "The local cognitive system encountered an " +
      "unexpected error. Verify that Ollama is running " +
      "and try again."
    );
  }

  switch (error.code) {
    case "offline":
      return (
        "Connection to Ollama was lost. Start Ollama " +
        "and retry the system check."
      );

    case "model-missing":
      return (
        `The required model "${REQUIRED_MODEL_NAME}" ` +
        "is unavailable. Restore or create the model, " +
        "then retry the system check."
      );

    case "timeout":
      return (
        "Ollama did not respond before the request " +
        "timed out. The model may still be loading. " +
        "Wait a moment and try again."
      );

    case "malformed-stream":
      return (
        "Ollama returned malformed response data. " +
        "The response was stopped safely. Please try again."
      );

    case "empty-response":
      return (
        "Ollama completed the request without returning " +
        "a response. Please try again."
      );

    case "stream-interrupted":
      return (
        "The response stream ended unexpectedly. " +
        "Check that Ollama is still running and try again."
      );

    case "request-failed":
    default:
      return (
        "Ollama rejected the request. Check the local " +
        "model and try again."
      );
  }
}

export async function streamMessage(
  messages: Message[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const { controller, clear } =
    createTimeoutController(
      CHAT_CONNECTION_TIMEOUT_MS,
      signal
    );

  let response: Response;

  try {
    response = await fetch(
      OLLAMA_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: REQUIRED_MODEL_NAME,
          messages: convertMessages(messages),
          stream: true,
        }),
      }
    );
  } catch (error: unknown) {
    clear();

    if (
      signal?.aborted ||
      (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        signal?.aborted
      )
    ) {
      throw new DOMException(
        "The request was stopped.",
        "AbortError"
      );
    }

    if (
      controller.signal.reason instanceof DOMException &&
      controller.signal.reason.name === "TimeoutError"
    ) {
      throw new OllamaRequestError(
        "timeout",
        "Ollama did not respond before the connection timeout."
      );
    }

    throw new OllamaRequestError(
      "offline",
      "Unable to connect to the local Ollama service."
    );
  }

  clear();

  if (!response.ok) {
    const errorText =
      await response.text();

    throw detectRequestError(
      response.status,
      errorText
    );
  }

  if (!response.body) {
    throw new OllamaRequestError(
      "stream-interrupted",
      "Ollama returned no readable response stream."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let receivedContent = false;
  let receivedDoneSignal = false;

  const processLine = (line: string) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return;
    }

    const parsed =
      parseStreamLine(trimmedLine);

    if (parsed.error) {
      const normalizedError =
        parsed.error.toLowerCase();

      if (
        normalizedError.includes("model") &&
        normalizedError.includes("not found")
      ) {
        throw new OllamaRequestError(
          "model-missing",
          parsed.error
        );
      }

      throw new OllamaRequestError(
        "request-failed",
        parsed.error
      );
    }

    const token =
      parsed.message?.content;

    if (
      typeof token === "string" &&
      token.length > 0
    ) {
      receivedContent = true;
      onToken(token);
    }

    if (parsed.done === true) {
      receivedDoneSignal = true;
    }
  };

  try {
    while (!receivedDoneSignal) {
      const { done, value } =
        await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);

        if (receivedDoneSignal) {
          break;
        }
      }
    }

    buffer += decoder.decode();

    if (
      !receivedDoneSignal &&
      buffer.trim()
    ) {
      processLine(buffer);
    }
  } catch (error: unknown) {
    if (
      signal?.aborted ||
      (
        error instanceof DOMException &&
        error.name === "AbortError"
      )
    ) {
      throw new DOMException(
        "The request was stopped.",
        "AbortError"
      );
    }

    if (error instanceof OllamaRequestError) {
      throw error;
    }

    throw new OllamaRequestError(
      "stream-interrupted",
      "The Ollama response stream was interrupted."
    );
  } finally {
    reader.releaseLock();
  }

  if (!receivedDoneSignal) {
    throw new OllamaRequestError(
      "stream-interrupted",
      "The Ollama response ended before completion."
    );
  }

  if (!receivedContent) {
    throw new OllamaRequestError(
      "empty-response",
      "Ollama completed without returning response content."
    );
  }
}