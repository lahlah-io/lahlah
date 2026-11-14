import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // `prisma generate` tidak menyentuh DB, tetapi config ini dievaluasi saat load.
  // Fallback menjaga CI/PR tanpa secret tetap bisa generate; perintah yang benar-benar
  // konek DB tetap gagal karena URL palsu ini tidak bisa dihubungi.
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://prisma:prisma@localhost:5432/prisma" },
});
