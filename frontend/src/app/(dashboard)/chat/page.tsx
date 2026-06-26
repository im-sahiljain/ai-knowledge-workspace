"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Conversation, ConversationDetail, Message, Citation } from "@/types";
import {
  MessageSquare,
  Plus,
  Send,
  Loader2,
  Trash2,
  FileText,
  ChevronDown,
  BookOpen,
  X,
} from "lucide-react";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showSources, setShowSources] = useState<Citation[] | null>(null);
  const [showConvList, setShowConvList] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.listConversations();
      setConversations(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  const loadConversation = async (id: string) => {
    try {
      const data = await api.getConversation(id);
      setActiveConversation(data);
      setShowConvList(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load conversation");
    }
  };

  const createNewConversation = async () => {
    try {
      const conv = await api.createConversation();
      await fetchConversations();
      await loadConversation(conv.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create conversation");
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      if (activeConversation?.id === id) setActiveConversation(null);
      fetchConversations();
      toast.success("Conversation deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !activeConversation || sending) return;

    const content = message.trim();
    setMessage("");
    setSending(true);

    // Optimistic: add user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      citations: null,
      created_at: new Date().toISOString(),
    };
    setActiveConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, tempUserMsg] } : prev
    );

    try {
      const response = await api.sendMessage(activeConversation.id, content);
      // Replace temp message + add assistant response
      setActiveConversation((prev) => {
        if (!prev) return prev;
        const msgs = prev.messages.filter((m) => m.id !== tempUserMsg.id);
        return {
          ...prev,
          messages: [...msgs, response.user_message, response.assistant_message],
        };
      });
      fetchConversations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      toast.error(msg);
      // Remove temp message
      setActiveConversation((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempUserMsg.id) } : prev
      );
      setMessage(content);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Conversation list */}
      <div
        className={`${
          showConvList ? "flex" : "hidden lg:flex"
        } w-full lg:w-72 flex-col border-r bg-card`}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h2 className="font-semibold text-sm">Conversations</h2>
          <button
            onClick={createNewConversation}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="New conversation"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {loadingConvs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  activeConversation?.id === conv.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{conv.title}</span>
                <span className="text-xs opacity-0 group-hover:opacity-100">
                  <Trash2
                    className="h-3.5 w-3.5 hover:text-red-500"
                    onClick={(e) => deleteConversation(conv.id, e)}
                  />
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col">
        {!activeConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8">
            <MessageSquare className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Start a Conversation</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Ask questions about your uploaded documents. The AI will find relevant information and cite its sources.
            </p>
            <button
              onClick={createNewConversation}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Conversation
            </button>
            <button
              onClick={() => setShowConvList(true)}
              className="mt-3 text-sm text-muted-foreground hover:text-foreground lg:hidden"
            >
              View conversations
            </button>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex h-14 items-center gap-3 border-b px-4">
              <button onClick={() => setShowConvList(true)} className="lg:hidden">
                <ChevronDown className="h-5 w-5 rotate-90" />
              </button>
              <h2 className="flex-1 truncate font-semibold text-sm">{activeConversation.title}</h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {activeConversation.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Ask a question about your documents</p>
                </div>
              )}

              {activeConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] lg:max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    {msg.citations && msg.citations.length > 0 && (
                      <button
                        onClick={() => setShowSources(msg.citations)}
                        className="mt-2 inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <FileText className="h-3 w-3" />
                        {msg.citations.length} source{msg.citations.length > 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask about your documents..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px] max-h-[120px]"
                  style={{ height: "auto", overflowY: message.split("\n").length > 3 ? "auto" : "hidden" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sources panel */}
      {showSources && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSources(null)}>
          <div className="mx-4 w-full max-w-lg max-h-[80vh] overflow-auto rounded-xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Sources ({showSources.length})</h3>
              <button onClick={() => setShowSources(null)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              {showSources.map((source, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium truncate">{source.document_name}</span>
                    {source.page_number && (
                      <span className="text-xs text-muted-foreground">p.{source.page_number}</span>
                    )}
                    {source.score && (
                      <span className="ml-auto text-xs text-muted-foreground">{(source.score * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-4">{source.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
