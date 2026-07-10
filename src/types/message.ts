export interface Message {
  sender: "user" | "amadeus";
  text: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface ConversationStore {
  version: 1;
  userId: string;
  activeConversationId: string | null;
  conversations: Conversation[];
}