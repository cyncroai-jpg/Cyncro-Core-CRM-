import { ensureCoreSchema } from "@/lib/core/db";
import { getRequestUser } from "@/lib/core/auth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const user = await getRequestUser(request);
    if (!user || !user.active) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    return Response.json({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
    });
  } catch (error) {
    console.error("auth.me_failed", error);
    return Response.json({ error: "Unable to verify session." }, { status: 500 });
  }
}
