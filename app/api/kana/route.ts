import { NextResponse } from "next/server";
import { convertTextToKana } from "../../lib/kana-completion";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        const body = await request.json() as { text?: unknown };
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) {
            return NextResponse.json({
                error: "text is required"
            }, {
                status: 400
            });
        }
        const kanaText = await convertTextToKana(text);
        return NextResponse.json({
            kana: kanaText
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : "kana conversion failed"
        }, {
            status: 500
        });
    }
}
