import { z } from "@/lib/utils/zod";
import countries from "country-list/data.json";

export function ageFromDate(value: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  const year = today.getFullYear();
  const birthdayPassed = today.getMonth() > parsed.getUTCMonth() || (today.getMonth() === parsed.getUTCMonth() && today.getDate() >= parsed.getUTCDate());
  return year - parsed.getUTCFullYear() - (birthdayPassed ? 0 : 1);
}

export const signupSchema = z.object({
  full_name: z.string().transform((name) => name.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim()).refine((name) => Array.from(name).length >= 1 && Array.from(name).length <= 120, "name_invalid"),
  email: z.string().trim().toLowerCase().email("email_invalid"),
  date_of_birth: z.string().refine((value) => { const age = ageFromDate(value); return age !== null && age >= 10 && age <= 100; }, "birth_date_invalid"),
  country: z.string().refine((value) => countries.some((country) => country.name === value), "country_invalid"),
  phone: z.string().transform((value) => value.replace(/[\s-]/g, "").replace(/^\+/, "")).refine((value) => !value || /^[0-9]{7,15}$/.test(value), "phone_invalid"),
});
