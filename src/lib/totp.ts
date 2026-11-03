import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Patrimoine Dashboard";

export function generateTotpSecret(): string {
  return generateSecret();
}

/** Allows ±30s of clock drift so the Pi's clock doesn't need to be perfectly
 * synced for 2FA to work. */
export async function verifyTotpToken(token: string, secret: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

export async function generateTotpQrCodeDataUrl(username: string, secret: string): Promise<string> {
  const uri = generateURI({ issuer: ISSUER, label: username, secret });
  return QRCode.toDataURL(uri);
}
