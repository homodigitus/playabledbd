import { z } from "zod";
import { USER_ROLES } from "../constants.js";

export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(USER_ROLES),
  createdAt: z.string()
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1).max(200)
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: userDtoSchema
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = z.object({
  user: userDtoSchema.nullable()
});
export type MeResponse = z.infer<typeof meResponseSchema>;
