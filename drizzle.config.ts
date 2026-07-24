import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./local.db",
    // drizzle-kit's "turso" dialect requires a non-empty authToken even for local
    // file mode, unlike the actual @libsql/client runtime (src/db/client.ts), which
    // is happy with undefined. This placeholder is only ever read by the CLI.
    authToken: process.env.TURSO_AUTH_TOKEN || "local-dev-placeholder",
  },
});
