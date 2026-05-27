/**
 * NextAuth v5 type augmentation.
 * Ensures `session.user.id` is available on the session object.
 */
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      mustChangePassword?: boolean;
    };
  }
}
