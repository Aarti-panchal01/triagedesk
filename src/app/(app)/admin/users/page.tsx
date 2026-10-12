import { requirePageSession } from "@/lib/auth";
import { listUsers } from "@/lib/data";
import { UserAdmin } from "./UserAdmin";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const s = await requirePageSession(["admin"]);
  const users = await listUsers();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>Passwords are hashed with bcrypt before they reach the database; the table rejects anything else.</p>
        </div>
      </div>
      <UserAdmin me={s.userId} users={users.map((u) => ({ ...u, last_login_at: u.last_login_at?.toISOString() ?? null }))} />
    </>
  );
}
