import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY not configured" },
        { status: 500 },
      );
    }

    // Test Gemini API key with the SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(
      "Hello, this is a test message.",
    );
    const response = await result.response;
    const reply = response.text();

    return NextResponse.json({
      success: true,
      message: "Gemini API key is valid",
      response: reply,
    });
  } catch (error) {
    console.error("Gemini test error:", error);
    return NextResponse.json(
      {
        error: "Gemini test failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
