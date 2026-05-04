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
  <div className="flex flex-col h-full overflow-hidden rounded-2xl bg-white/95 backdrop-blur shadow-2xl border border-slate-200">
    {/* Header */}
    <div className="relative flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500">
      <div className="absolute inset-0 bg-white/5 backdrop-blur" />

      <div className="relative flex items-center gap-3">
        <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-white/20 border border-white/20 shadow-lg">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>

        <div>
          <h3 className="font-bold text-white tracking-tight text-base">
            Trợ lý AI Gia Phả
          </h3>

          <p className="text-xs text-blue-100 mt-0.5">
            Hỗ trợ tra cứu cây gia phả thông minh
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="relative p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
      >
        <X className="w-5 h-5" />
      </button>
    </div>

    {/* Messages */}
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-gradient-to-b from-slate-50 to-slate-100">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex ${
            msg.role === "user"
              ? "justify-end"
              : "justify-start"
          }`}
        >
          <div
            className={`group relative max-w-[85%] px-4 py-3 rounded-3xl shadow-sm transition-all duration-200 ${
              msg.role === "user"
                ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-br-md"
                : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
            }`}
          >
            {/* AI label */}
            {msg.role !== "user" && (
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-slate-500">
                  AI Assistant
                </span>
              </div>
            )}

            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {msg.content}
            </p>

            {msg.timestamp && (
              <p
                className={`text-[11px] mt-2 ${
                  msg.role === "user"
                    ? "text-blue-100"
                    : "text-slate-400"
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

      {/* Loading */}
      {loading && (
        <div className="flex justify-start">
          <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-3xl rounded-bl-md shadow-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-100" />
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-200" />
            </div>

            <span className="text-sm text-slate-500">
              AI đang suy nghĩ...
            </span>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>

    {/* Input */}
    <div className="border-t border-slate-200 bg-white/90 backdrop-blur px-4 py-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Nhập câu hỏi về gia phả..."
            disabled={loading}
            className="min-h-[48px] rounded-2xl border-slate-300 bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-400 text-sm"
          />
        </div>
        
        <Button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="h-12 w-12 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg transition-all duration-200"
        >
          {loading ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>
    
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setInput("Ai là trưởng họ?")}
          className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
        >
          Ai là trưởng họ?
        </button>

        <button
          onClick={() => setInput("Thống kê số thành viên")}
          className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
        >
          Thống kê thành viên
        </button>

        <button
          onClick={() => setInput("Tìm con cháu đời thứ 3")}
          className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
        >
          Tìm đời thứ 3
        </button>
      </div>
    </div>
  </div>
);
}
