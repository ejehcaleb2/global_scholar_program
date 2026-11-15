import commonPasswords from "@/lib/utils/common-passwords.json";

const common = new Set(commonPasswords);
export function passwordChecks(password: string, email: string, name: string) {
  const normalized = password.toLowerCase();
  const bytes = new TextEncoder().encode(password).length;
  const identifiers = [email.trim().toLowerCase().split("@")[0], name.trim().toLowerCase(), ...name.trim().toLowerCase().split(/\s+/)].filter(Boolean);
  return {
    bytes: bytes >= 10 && bytes <= 72,
    identity: !identifiers.some((part) => normalized.includes(part)),
    common: !common.has(normalized),
  };
}
