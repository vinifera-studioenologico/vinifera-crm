import { z } from "zod";

export const NotificationSettingsSchema = z.object({
  telegramBotToken: z.string().default(""),
  telegramChatId: z.string().default(""),
  notifyEmail: z.string().email("Email non valida").or(z.literal("")).default(""),
  installmentWarningDays: z.number().int().min(0).max(30).default(3),
});

export type NotificationSettingsValues = z.infer<typeof NotificationSettingsSchema>;
