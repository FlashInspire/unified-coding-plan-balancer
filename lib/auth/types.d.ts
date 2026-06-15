/**
 * NextAuth v5 type augmentation.
 * Ensures `session.user.id` and profile fields are available on the session object.
 */
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      role?: string;
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
      mustChangePassword?: boolean;
      language?: string;
      theme?: string;
    };
  }
}
