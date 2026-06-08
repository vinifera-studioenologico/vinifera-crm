import { z } from "zod";
import { zNonEmptyString, zEmail } from "./validators";

export const SupportFormSchema = z.object({
  name: zNonEmptyString
    .min(2, "Minimo 2 caratteri")
    .max(100, "Massimo 100 caratteri"),
  email: zEmail,
  phone: z
    .string()
    .max(30, "Massimo 30 caratteri")
    .optional()
    .or(z.literal("")),
  subject: zNonEmptyString
    .min(2, "Minimo 2 caratteri")
    .max(200, "Massimo 200 caratteri"),
  message: zNonEmptyString
    .min(2, "Minimo 2 caratteri")
    .max(5000, "Massimo 5000 caratteri"),
});

export type SupportFormValues = z.infer<typeof SupportFormSchema>;
