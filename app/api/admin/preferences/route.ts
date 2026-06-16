import { auth } from "@/lib/auth/nextauth";
import { userPreferenceRepo } from "@/lib/repositories/userPreferenceRepo";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  language: z.enum(["en", "zh"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  dateTimeFormat: z.string().optional(),
  use24Hour: z.boolean().optional(),
});

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await userPreferenceRepo.get(session.user.id);
  return Response.json({ data: prefs });
}

export async function PATCH(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }
  const prefs = await userPreferenceRepo.set(session.user.id, parsed.data);
  return Response.json({ data: prefs });
}
