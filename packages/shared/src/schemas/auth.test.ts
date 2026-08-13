import { describe, expect, it } from "vitest";
import { loginRequestSchema, loginResponseSchema, meResponseSchema, userDtoSchema } from "./auth.js";

describe("userDtoSchema", () => {
  const validUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    email: "user@example.com",
    name: "Jane Doe",
    role: "USER",
    createdAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a well-formed user", () => {
    const result = userDtoSchema.safeParse(validUser);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validUser);
    }
  });

  it("accepts ADMIN role", () => {
    const result = userDtoSchema.safeParse({ ...validUser, role: "ADMIN" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid uuid for id", () => {
    const result = userDtoSchema.safeParse({ ...validUser, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = userDtoSchema.safeParse({ ...validUser, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid role", () => {
    const result = userDtoSchema.safeParse({ ...validUser, role: "SUPERUSER" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { name: _name, ...withoutName } = validUser;
    const result = userDtoSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("accepts a well-formed login request", () => {
    const result = loginRequestSchema.safeParse({ email: "user@example.com", password: "hunter2" });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from email", () => {
    const result = loginRequestSchema.safeParse({ email: "  user@example.com  ", password: "hunter2" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("rejects an invalid email", () => {
    const result = loginRequestSchema.safeParse({ email: "not-an-email", password: "hunter2" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginRequestSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a password exactly at the 200 character max", () => {
    const result = loginRequestSchema.safeParse({ email: "user@example.com", password: "a".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("rejects a password over the 200 character max", () => {
    const result = loginRequestSchema.safeParse({ email: "user@example.com", password: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects a missing password", () => {
    const result = loginRequestSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });
});

describe("loginResponseSchema", () => {
  const validUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    email: "user@example.com",
    name: "Jane Doe",
    role: "USER",
    createdAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a response wrapping a valid user", () => {
    const result = loginResponseSchema.safeParse({ user: validUser });
    expect(result.success).toBe(true);
  });

  it("rejects a response with an invalid nested user", () => {
    const result = loginResponseSchema.safeParse({ user: { ...validUser, email: "bad" } });
    expect(result.success).toBe(false);
  });

  it("rejects a missing user field", () => {
    const result = loginResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("meResponseSchema", () => {
  const validUser = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    email: "user@example.com",
    name: "Jane Doe",
    role: "ADMIN",
    createdAt: "2024-01-01T00:00:00.000Z"
  };

  it("accepts a null user (unauthenticated)", () => {
    const result = meResponseSchema.safeParse({ user: null });
    expect(result.success).toBe(true);
  });

  it("accepts a populated user", () => {
    const result = meResponseSchema.safeParse({ user: validUser });
    expect(result.success).toBe(true);
  });

  it("rejects an undefined user field (must be explicitly null, not omitted)", () => {
    const result = meResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
