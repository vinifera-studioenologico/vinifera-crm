import { z } from "zod";

export const NotificationSettingsSchema = z.object({
  telegramBotToken: z.string().default(""),
  telegramChatId: z.string().default(""),
  notifyEmail: z.string().email("Email non valida").or(z.literal("")).default(""),
});

export type NotificationSettingsValues = z.infer<typeof NotificationSettingsSchema>;
