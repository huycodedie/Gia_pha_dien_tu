import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function generateGeminiResponse(prompt: string, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let message: string | null = null;
  let context: any = null;

  try {
    const body = await request.json();
    userId = body.userId;
    message = body.message;
    context = body.context;

    console.log("Chat API called with:", {
      message: message?.substring(0, 100),
      userId,
      hasContext: !!context,
    });

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Vui lòng nhập câu hỏi" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      console.error("GOOGLE_AI_API_KEY not found in environment");
      return NextResponse.json(
        { error: "API key chưa được cấu hình" },
        { status: 500 },
      );
    }

    const contextInfo = context
      ? `
Thông tin cây gia phả:
- Tổng số người: ${context.totalPeople || 0}
- Tổng số gia đình: ${context.totalFamilies || 0}
- Số thế hệ: ${context.totalGenerations || 0}
- Số người sống: ${context.livingCount || 0}
- Số người đã mất: ${context.deceasedCount || 0}
- Số người chính tộc: ${context.patrilinealCount || 0}

Các thành viên trong cây:
${
  context.people
    ?.slice(0, 50)
    .map(
      (p: any) =>
        `- ${p.displayName} (Thế hệ ${p.generation}${p.isLiving ? "" : ", đã mất"})`,
    )
    .join("\n") || ""
}
`
      : "";

    const prompt = `Bạn là trợ lý AI chuyên biệt giúp người dùng tìm hiểu về cây gia phả. Bạn có thể:
1. Trả lời câu hỏi về các thành viên trong gia đình
2. Giúp tìm kiếm người theo tên hoặc mối quan hệ
3. Cung cấp thông tin thống kê về cây gia phả
4. Giải thích mối quan hệ gia đình
5. Hỗ trợ quản lý dữ liệu gia đình

Luôn trả lời bằng tiếng Việt. Nếu không tìm thấy thông tin, hãy gợi ý người dùng cách cập nhật dữ liệu.

${contextInfo}

Câu hỏi: ${message}`;

    const reply =
      (await generateGeminiResponse(prompt, apiKey)) ||
      "Xin lỗi, tôi không thể trả lời câu hỏi này.";

    // Optionally save chat history to database
    if (userId) {
      try {
        const supabase = createServiceClient();
        await supabase.from("chat_history").insert({
          user_id: userId,
          message: message.substring(0, 500),
          response: reply.substring(0, 1000),
          created_at: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error("Error saving chat history:", dbError);
        // Don't fail the request if we can't save history
      }
    }

    return NextResponse.json({
      reply,
      success: true,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    // Log error to database for admin monitoring
    try {
      const supabase = createServiceClient();
      await supabase.from("error_logs").insert({
        user_id: userId || null,
        error_type: "api",
        error_message: `Chat API Error: ${error instanceof Error ? error.message : String(error)}`,
        error_stack: error instanceof Error ? error.stack : null,
        url: "/api/chat",
        request_data: { message: message?.substring(0, 100) },
        context_data: { hasContext: !!context },
        severity: "high",
      });
    } catch (logError) {
      console.error("Failed to log error:", logError);
    }

    // Generic error handling for Gemini
    if ((error as any)?.message?.includes("401")) {
      return NextResponse.json(
        { error: "API key không hợp lệ hoặc không đủ quyền" },
        { status: 401 },
      );
    }
    if ((error as any)?.message?.includes("429")) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
        { status: 429 },
      );
    }

    if (
      (error as any)?.name === "TypeError" &&
      (error as any)?.message?.includes("fetch")
    ) {
      return NextResponse.json(
        { error: "Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "Lỗi server. Đã ghi nhận và sẽ được xử lý." },
      { status: 500 },
    );
  }
}
