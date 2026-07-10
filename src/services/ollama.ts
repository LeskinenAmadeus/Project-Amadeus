import {
  Channel,
  invoke,
} from "@tauri-apps/api/core";
import type { Message } from "../types/message";

export const REQUIRED_MODEL_NAME =
  "amadeus-kurisu";

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

type OllamaStreamEvent = {
  event: "token";
  data: {
    token: string;
  };
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
      (message) =>
        message.text.trim().length > 0
    )
    .map((message) => ({
      role:
        message.sender === "user"
          ? "user"
          : "assistant",
      content: message.text,
    }));
}

function getErrorText(
  error: unknown
): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return (
    "The local cognitive system failed " +
    "unexpectedly."
  );
}

function parseRustError(
  error: unknown
): OllamaRequestError {
  const message = getErrorText(error);

  if (message === "ABORTED") {
    throw new DOMException(
      "The request was stopped.",
      "AbortError"
    );
  }

  if (message.startsWith("OFFLINE:")) {
    return new OllamaRequestError(
      "offline",
      message
        .replace("OFFLINE:", "")
        .trim()
    );
  }

  if (
    message.startsWith("MODEL_MISSING:")
  ) {
    return new OllamaRequestError(
      "model-missing",
      message
        .replace("MODEL_MISSING:", "")
        .trim()
    );
  }

  if (message.startsWith("TIMEOUT:")) {
    return new OllamaRequestError(
      "timeout",
      message
        .replace("TIMEOUT:", "")
        .trim()
    );
  }

  if (
    message.startsWith("MALFORMED_STREAM:")
  ) {
    return new OllamaRequestError(
      "malformed-stream",
      message
        .replace("MALFORMED_STREAM:", "")
        .trim()
    );
  }

  if (
    message.startsWith("EMPTY_RESPONSE:")
  ) {
    return new OllamaRequestError(
      "empty-response",
      message
        .replace("EMPTY_RESPONSE:", "")
        .trim()
    );
  }

  if (
    message.startsWith(
      "STREAM_INTERRUPTED:"
    )
  ) {
    return new OllamaRequestError(
      "stream-interrupted",
      message
        .replace(
          "STREAM_INTERRUPTED:",
          ""
        )
        .trim()
    );
  }

  return new OllamaRequestError(
    "request-failed",
    message
      .replace("REQUEST_FAILED:", "")
      .trim()
  );
}

export async function checkOllamaSystemStatus(): Promise<OllamaSystemStatus> {
  try {
    return await invoke<OllamaSystemStatus>(
      "check_ollama_system_status"
    );
  } catch (error: unknown) {
    console.error(
      "Unable to check Ollama system status:",
      error
    );

    return {
      status: "offline",
      ollamaOnline: false,
      modelAvailable: false,
    };
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
        error.message ||
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
  const requestId = crypto.randomUUID();

  const onEvent =
    new Channel<OllamaStreamEvent>();

  let receivedContent = false;

  onEvent.onmessage = (
    message: OllamaStreamEvent
  ) => {
    if (
      message.event !== "token" ||
      typeof message.data?.token !== "string" ||
      message.data.token.length === 0
    ) {
      return;
    }

    receivedContent = true;
    onToken(message.data.token);
  };

  const cancelRequest = () => {
    void invoke("cancel_ollama_stream", {
      requestId,
    }).catch((error: unknown) => {
      console.error(
        "Unable to cancel Ollama stream:",
        error
      );
    });
  };

  if (signal?.aborted) {
    cancelRequest();

    throw new DOMException(
      "The request was stopped.",
      "AbortError"
    );
  }

  signal?.addEventListener(
    "abort",
    cancelRequest,
    { once: true }
  );

  try {
    await invoke<void>(
      "stream_ollama_message",
      {
        requestId,
        messages: convertMessages(messages),
        onEvent,
      }
    );

    if (
      signal?.aborted
    ) {
      throw new DOMException(
        "The request was stopped.",
        "AbortError"
      );
    }

    if (!receivedContent) {
      throw new OllamaRequestError(
        "empty-response",
        "Ollama completed without returning response content."
      );
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

    throw parseRustError(error);
  } finally {
    signal?.removeEventListener(
      "abort",
      cancelRequest
    );
  }
}