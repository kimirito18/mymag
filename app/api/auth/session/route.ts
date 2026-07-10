import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserContext } from "@/app/lib/server-current-user";
import { createDatabaseUnavailableResponse, isDatabaseUnavailableError } from "@/app/lib/server-database-error";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserContext(request);
    return NextResponse.json({
      authenticated: true,
      user: {
        userId: currentUser.userId,
        loginName: currentUser.loginName,
        displayName: currentUser.displayName,
        role: currentUser.role
      }
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return createDatabaseUnavailableResponse("データベースに接続できないためセッションを確認できません。");
    }
    return NextResponse.json({
      authenticated: false
    }, {
      status: 401
    });
  }
}
