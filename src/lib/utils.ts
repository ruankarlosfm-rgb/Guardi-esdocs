import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generatePassword(length = 16) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*()_+-=[]{}|;:,.<>/?";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  return retVal;
}

export function calculateStrength(password: string) {
  let score = Math.floor(password.length / 4);
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 2;
  
  if (score >= 8) return { label: "FORTE", color: "text-emerald-400", bg: "bg-emerald-400/20" };
  if (score >= 5) return { label: "MÉDIA", color: "text-amber-400", bg: "bg-amber-400/20" };
  return { label: "FRACA", color: "text-rose-400", bg: "bg-rose-400/20" };
}
