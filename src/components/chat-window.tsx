"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

interface ChatWindowProps {
  treeData?: {
    people: any[];
    families: any[];
  };
  onClose: () => void;
}

export function ChatWindow({ treeData, onClose }: ChatWindowProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Xin chào! Tôi là trợ lý AI của cây gia phả. Bạn có thể hỏi tôi về thành viên, mối quan hệ, hoặc thống kê của cây gia phả. Có điều gì tôi có thể giúp bạn không?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const prepareContext = () => {
    if (!treeData) return null;

    const generations = Array.from(
      new Set(treeData.people.map((p) => p.generation)),
    );
    const livingCount = treeData.people.filter((p) => p.isLiving).length;
    const deceasedCount = treeData.people.filter((p) => !p.isLiving).length;
    const patrilinealCount = treeData.people.filter(
      (p) => p.isPatrilineal,
    ).length;

    return {
      totalPeople: treeData.people.length,
      totalFamilies: treeData.families.length,
      totalGenerations: generations.length,
      livingCount,
      deceasedCount,
      patrilinealCount,
      people: treeData.people.slice(0, 50),
    };
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      },
    ]);

    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: prepareContext(),
          userId: user?.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Lỗi không xác định");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Lỗi khi kết nối với AI";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-500">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Trợ lý AI Gia Phả</h3>
            <p className="text-xs text-slate-500">Hỏi về cây gia phả của bạn</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-blue-200 text-slate-500 hover:text-slate-700 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs px-4 py-3 rounded-2xl break-words ${
                msg.role === "user"
                  ? "bg-blue-500 text-white rounded-br-none"
                  : "bg-white border border-slate-200 text-slate-900 rounded-bl-none shadow-sm"
              }`}
            >
              <p className="text-sm leading-relaxed">{msg.content}</p>
              {msg.timestamp && (
                <p
                  className={`text-xs mt-1 ${
                    msg.role === "user" ? "text-blue-100" : "text-slate-400"
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl rounded-bl-none">
              <Loader className="w-4 h-4 animate-spin text-blue-500" />
              <span className="text-sm text-slate-500">Đang suy nghĩ...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nhập câu hỏi... (Shift+Enter để xuống dòng)"
            disabled={loading}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            size="sm"
            className="px-4"
          >
            {loading ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          💡 Hỏi về tên người, mối quan hệ, thống kê cây gia phả...
        </p>
      </div>
    </div>
  );
}
