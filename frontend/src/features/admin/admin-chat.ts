const STORAGE_KEY = "mais-saude-admin-chat-v1";

export type AdminChatMessage = {
  id: string;
  sender: "admin" | "participant";
  text: string;
  sentAt: string;
};

export type AdminConversation = {
  id: string;
  participant: { name: string; email: string; role: "nutritionist" };
  unread: number;
  messages: AdminChatMessage[];
};

const initialConversations: AdminConversation[] = [
  conversation("chat-marina", "Marina Costa", "marina@nutrimais.demo", 1, [
    ["participant", "Os cadastros dos pacientes da minha agenda já estão organizados.", 26],
    ["admin", "Perfeito. Se identificar alguma inconsistência, pode nos avisar por aqui.", 24],
  ]),
  conversation("chat-ana", "Ana Souza", "ana@nutrimais.demo", 0, [
    ["admin", "Olá, Ana. Seu acesso de nutricionista está funcionando normalmente?", 76],
    ["participant", "Sim, está tudo certo. Obrigada pelo acompanhamento.", 72],
  ]),
  conversation("chat-paulo", "Paulo Mendes", "paulo@nutrimais.demo", 0, [
    ["participant", "Gostaria de confirmar se os novos pacientes já aparecem na minha lista.", 50],
    ["admin", "Sim. Os registros demonstrativos já foram atualizados.", 47],
  ]),
  conversation("chat-fernanda", "Fernanda Nunes", "fernanda@nutrimais.demo", 0, [
    ["admin", "Olá, Fernanda. Estamos disponíveis caso precise de suporte no painel.", 102],
  ]),
];

export function readAdminConversations(): AdminConversation[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return initialConversations.map(cloneConversation);
  try {
    const conversations = JSON.parse(stored) as unknown;
    if (!Array.isArray(conversations)) return initialConversations.map(cloneConversation);
    const nutritionistConversations = conversations.filter(isConversation).filter((conversation) => conversation.participant.role === "nutritionist");
    return nutritionistConversations.length ? nutritionistConversations : initialConversations.map(cloneConversation);
  } catch {
    return initialConversations.map(cloneConversation);
  }
}

export function sendAdminMessage(conversations: AdminConversation[], conversationId: string, text: string) {
  const next = conversations.map((conversation) => conversation.id === conversationId ? {
    ...conversation,
    unread: 0,
    messages: [...conversation.messages, { id: crypto.randomUUID(), sender: "admin" as const, text: text.trim(), sentAt: new Date().toISOString() }],
  } : conversation);
  return next;
}

export function markConversationRead(conversations: AdminConversation[], conversationId: string) {
  const next = conversations.map((conversation) => conversation.id === conversationId && conversation.unread ? { ...conversation, unread: 0 } : conversation);
  return next;
}

export function saveAdminConversations(conversations: AdminConversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  return conversations;
}

function conversation(id: string, name: string, email: string, unread: number, messages: ["admin" | "participant", string, number][]): AdminConversation {
  return { id, participant: { name, email, role: "nutritionist" }, unread, messages: messages.map(([sender, text, hoursAgo], index) => ({ id: `${id}-${index}`, sender, text, sentAt: hoursAgoDate(hoursAgo) })) };
}

function hoursAgoDate(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function cloneConversation(conversation: AdminConversation): AdminConversation {
  return { ...conversation, participant: { ...conversation.participant }, messages: conversation.messages.map((message) => ({ ...message })) };
}

function isConversation(value: unknown): value is AdminConversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AdminConversation>;
  return typeof item.id === "string" && item.participant?.role === "nutritionist" && Array.isArray(item.messages) && typeof item.unread === "number";
}
