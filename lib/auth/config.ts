/**
 * Auth.js v5 configuration.
 *
 * Credentials provider only — email + password. JWT session strategy (see spec
 * §Session strategy for why not DB sessions).
 *
 * The Prisma adapter is wired even though JWT sessions don't require it — it
 * makes future OAuth additions painless.
 */
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validation/auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  // Use the request's Host header for URL construction rather than a pinned
  // `AUTH_URL` env var. Without this, Auth.js on a Vercel preview deployment
  // constructs redirects (e.g. `/login?error=MissingCSRF`) against the
  // production origin, which then 404s if there's no production deployment
  // yet — that's how the E2E `loggedInPage` fixture was seeing "deployment
  // could not be found" and misreporting it as a fixture failure.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({ where: { email } });

        // Constant-time enumeration guard: always run argon2.verify — either
        // against the user's real hash or against a pre-computed static dummy
        // hash for unknown emails. Static (not lazy) so the cost matches on
        // the very first cold-start attempt too. See lib/auth/password.ts.
        const hashToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
        const ok = await verifyPassword(hashToVerify, password);

        if (!user?.passwordHash || !ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    // Persist the id/username into the JWT so pages/APIs can read them without
    // a DB round-trip.
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.username = (user as { username?: string | null }).username ?? null;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = (token.username as string | null) ?? null;
      }
      return session;
    },
  },
});
