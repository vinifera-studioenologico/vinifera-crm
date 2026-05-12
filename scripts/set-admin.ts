#!/usr/bin/env tsx
/**
 * Script per settare il custom claim role="admin" su un utente Firebase.
 * Uso: npx tsx scripts/set-admin.ts <email|uid>
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const arg = process.argv[2];
if (!arg) {
  console.error("Uso: npx tsx scripts/set-admin.ts <email|uid>");
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? "",
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "",
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  }),
});

const adminAuth = getAuth(app);

async function main() {
  const isEmail = arg.includes("@");
  const user = isEmail
    ? await adminAuth.getUserByEmail(arg)
    : await adminAuth.getUser(arg);
  await adminAuth.setCustomUserClaims(user.uid, { role: "admin" });
  console.log(`✅ Custom claim role=admin settato per ${user.email ?? user.uid} (uid: ${user.uid})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
