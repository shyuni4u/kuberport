import { cookies } from "next/headers";
import { pool } from "./db";
import crypto from "node:crypto";

const COOKIE = "kbp_sid";

export interface Session {
  id: string;
  userId: string;
  idToken: string;
  refreshToken?: string;
  idTokenExp: Date;
}

function getKey(): Buffer {
  return Buffer.from(process.env.APP_ENCRYPTION_KEY_B64!, "base64");
}

function encrypt(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

function decrypt(b64: string): string {
  const key = getKey();
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

export async function createSession(
  userId: string,
  idToken: string,
  refreshToken: string | undefined,
  exp: Date,
) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await pool.query(
    `INSERT INTO sessions (id, user_id, id_token_encrypted, refresh_token_encrypted, id_token_exp, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      userId,
      encrypt(idToken),
      refreshToken ? encrypt(refreshToken) : null,
      exp,
      expiresAt,
    ],
  );
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get(COOKIE)?.value;
  if (!id) return null;
  const { rows } = await pool.query(
    `SELECT id, user_id, id_token_encrypted, refresh_token_encrypted, id_token_exp
       FROM sessions WHERE id=$1 AND expires_at > now()`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    userId: rows[0].user_id,
    idToken: decrypt(rows[0].id_token_encrypted),
    refreshToken: rows[0].refresh_token_encrypted
      ? decrypt(rows[0].refresh_token_encrypted)
      : undefined,
    idTokenExp: rows[0].id_token_exp,
  };
}

export async function updateSessionTokens(
  sessionId: string,
  idToken: string,
  refreshToken: string | undefined,
  exp: Date,
) {
  await pool.query(
    `UPDATE sessions SET id_token_encrypted=$1, refresh_token_encrypted=$2, id_token_exp=$3
     WHERE id=$4`,
    [
      encrypt(idToken),
      refreshToken ? encrypt(refreshToken) : null,
      exp,
      sessionId,
    ],
  );
}

export async function destroySession() {
  const cookieStore = await cookies();
  const id = cookieStore.get(COOKIE)?.value;
  if (id) await pool.query("DELETE FROM sessions WHERE id=$1", [id]);
  cookieStore.delete(COOKIE);
}
