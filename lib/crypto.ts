import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const PAYLOAD_PREFIX = "v1";
const KEY_FILE = path.join(process.cwd(), ".data", "app-secret.key");

let cachedKey: Buffer | undefined;

function parseKey(raw: string): Buffer | null {
  const value = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.length === KEY_BYTES ? decoded : null;
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.APP_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.trim() !== "") {
    const key = parseKey(fromEnv);
    if (!key) {
      throw new Error(
        "APP_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters.",
      );
    }
    cachedKey = key;
    return key;
  }

  if (fs.existsSync(KEY_FILE)) {
    const key = parseKey(fs.readFileSync(KEY_FILE, "utf8"));
    if (!key) {
      throw new Error(`Secret key file ${KEY_FILE} is invalid.`);
    }
    cachedKey = key;
    return key;
  }

  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  const generated = randomBytes(KEY_BYTES);
  try {
    fs.writeFileSync(KEY_FILE, generated.toString("base64"), {
      mode: 0o600,
      flag: "wx",
    });
    fs.chmodSync(KEY_FILE, 0o600);
    cachedKey = generated;
    return generated;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const key = parseKey(fs.readFileSync(KEY_FILE, "utf8"));
    if (!key) {
      throw new Error(`Secret key file ${KEY_FILE} is invalid.`);
    }
    cachedKey = key;
    return key;
  }
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const cipherText = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PAYLOAD_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    cipherText.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PAYLOAD_PREFIX) {
    throw new Error("Unsupported encrypted payload format.");
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(cipherB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
