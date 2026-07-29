import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

// Prisma 7 dropped the Rust query engine, so a driver adapter is required.
const DATABASE_URL = process.env.DATABASE_URL ?? "file:./dev.db";

// Next dev reloads modules on every edit; without caching on globalThis each
// reload would open another SQLite connection and leak file handles.
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

function createClient() {
    const adapter = new PrismaBetterSqlite3({ url: DATABASE_URL });
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
