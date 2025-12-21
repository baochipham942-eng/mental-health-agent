
import NextAuth, { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
    /**
     * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
     */
    interface Session {
        user: {
            id: string
            username?: string
            nickname?: string | null
            avatar?: string | null
            phone?: string | null
            quickLoginToken?: string | null
        } & DefaultSession["user"]
    }

    interface User {
        username?: string
        nickname?: string | null
        avatar?: string | null
        phone?: string | null
        quickLoginToken?: string | null
        passwordHash?: string // Prisma model has this, though we usually don't expose it
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        name?: string | null
        username?: string
        nickname?: string | null
        avatar?: string | null
        phone?: string | null
        quickLoginToken?: string | null
    }
}
