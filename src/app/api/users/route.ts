import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { handler, requireApiSession } from "@/lib/api";
import { withTransaction } from "@/lib/db";
import { listUsers } from "@/lib/data";
import { createUserSchema } from "@/lib/validation";

export const GET = handler(async () => {
  await requireApiSession(["admin"]);
  return NextResponse.json(await listUsers());
});

export const POST = handler(async (req) => {
  const s = await requireApiSession(["admin"]);
  const b = createUserSchema.parse(await req.json());
  const hash = await bcrypt.hash(b.password, 12); // never store the password itself
  const id = await withTransaction(s.userId, async (db) => {
    const { rows } = await db.query<{ user_id: number }>(
      `INSERT INTO app_user (full_name, email, password_hash, role, max_open_cases)
       VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
      [b.full_name, b.email, hash, b.role, b.max_open_cases],
    );
    return rows[0].user_id;
  });
  return NextResponse.json({ user_id: id }, { status: 201 });
});
