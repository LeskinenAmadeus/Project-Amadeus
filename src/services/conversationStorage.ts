import { invoke } from "@tauri-apps/api/core";
import type {
  Conversation,
  ConversationStore,
  Message,
} from "../types/message";

const CURRENT_USER_ID = "local-default";
const STORE_VERSION = 1;

export const DEFAULT_MESSAGES: Message[] = [
  {
    sender: "amadeus",
    text: "AMADEUS cognitive interface initialized.",
  },
  {
    sender: "amadeus",
    text: "Local systems are online. Awaiting operator input.",
  },
];

function createConversationId(): string {
  return `conversation-${crypto.randomUUID()}`;
}

function createConversationTitle(messages: Message[]): string {
  const firstUserMessage = messages.find(
    (message) => message.sender === "user" && message.text.trim()
  );

  if (!firstUserMessage) {
    return "New Conversation";
  }

  const normalizedTitle = firstUserMessage.text
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedTitle.length <= 48) {
    return normalizedTitle;
  }

  return `${normalizedTitle.slice(0, 45)}...`;
}

export function createDefaultConversationStore(): ConversationStore {
  const now = new Date().toISOString();
  const conversationId = createConversationId();

  return {
    version: STORE_VERSION,
    userId: CURRENT_USER_ID,
    activeConversationId: conversationId,
    conversations: [
      {
        id: conversationId,
        title: "New Conversation",
        createdAt: now,
        updatedAt: now,
        messages: DEFAULT_MESSAGES,
      },
    ],
  };
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<Message>;

  return (
    (message.sender === "user" || message.sender === "amadeus") &&
    typeof message.text === "string"
  );
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const conversation = value as Partial<Conversation>;

  return (
    typeof conversation.id === "string" &&
    typeof conversation.title === "string" &&
    typeof conversation.createdAt === "string" &&
    typeof conversation.updatedAt === "string" &&
    Array.isArray(conversation.messages) &&
    conversation.messages.every(isMessage)
  );
}

function isConversationStore(value: unknown): value is ConversationStore {
  if (!value || typeof value !== "object") {
    return false;
  }

  const store = value as Partial<ConversationStore>;

  return (
    store.version === STORE_VERSION &&
    store.userId === CURRENT_USER_ID &&
    (store.activeConversationId === null ||
      typeof store.activeConversationId === "string") &&
    Array.isArray(store.conversations) &&
    store.conversations.every(isConversation)
  );
}

export async function loadConversationStore(): Promise<ConversationStore> {
  const storedJson = await invoke<string | null>(
    "load_conversation_store"
  );

  if (!storedJson) {
    return createDefaultConversationStore();
  }

  try {
    const parsedStore: unknown = JSON.parse(storedJson);

    if (!isConversationStore(parsedStore)) {
      console.warn(
        "Saved conversation history had an unsupported structure. Using a new local store."
      );

      return createDefaultConversationStore();
    }

    return parsedStore;
  } catch (error) {
    console.error("Unable to parse saved conversation history:", error);
    return createDefaultConversationStore();
  }
}

export async function saveConversationStore(
  store: ConversationStore
): Promise<void> {
  await invoke("save_conversation_store", {
    conversationStoreJson: JSON.stringify(store, null, 2),
  });
}

export function getActiveConversation(
  store: ConversationStore
): Conversation {
  const activeConversation = store.conversations.find(
    (conversation) => conversation.id === store.activeConversationId
  );

  if (activeConversation) {
    return activeConversation;
  }

  const firstConversation = store.conversations[0];

  if (firstConversation) {
    return firstConversation;
  }

  return createDefaultConversationStore().conversations[0];
}

export function updateActiveConversationMessages(
  store: ConversationStore,
  messages: Message[]
): ConversationStore {
  const activeConversation = getActiveConversation(store);
  const now = new Date().toISOString();

  const updatedConversation: Conversation = {
    ...activeConversation,
    title: createConversationTitle(messages),
    updatedAt: now,
    messages,
  };

  const conversationExists = store.conversations.some(
    (conversation) => conversation.id === activeConversation.id
  );

  return {
    ...store,
    activeConversationId: activeConversation.id,
    conversations: conversationExists
      ? store.conversations.map((conversation) =>
          conversation.id === activeConversation.id
            ? updatedConversation
            : conversation
        )
      : [...store.conversations, updatedConversation],
  };
}