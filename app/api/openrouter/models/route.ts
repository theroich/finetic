import { NextResponse } from "next/server";
import { fetchOpenRouterModels } from "@/lib/openrouter-server";

export async function GET() {
  try {
    const models = await fetchOpenRouterModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error("OpenRouter catalog error:", error);

    return NextResponse.json(
      { error: "Failed to load the OpenRouter model catalog." },
      { status: 502 }
    );
  }
}
