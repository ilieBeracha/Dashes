import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;

      // Upsert user on sign-in
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.githubId, Number(profile.id)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(users).values({
          githubId: Number(profile.id),
          username: (profile.login as string) ?? "unknown",
          email: profile.email ?? null,
          name: (profile.name as string) ?? null,
          avatarUrl: (profile.avatar_url as string) ?? null,
        });
      }

      return true;
    },

    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.email, session.user.email))
          .limit(1);

        if (dbUser.length > 0) {
          session.user.id = dbUser[0].id;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
