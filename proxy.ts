import { auth } from "@/lib/auth/edge";
export default auth;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|login|api/auth|api/v1|api/health).*)",
  ],
};
