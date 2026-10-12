import { requirePageSession } from "@/lib/auth";
import { ProtocolForm } from "../ProtocolForm";

export const metadata = { title: "Add protocol" };

export default async function NewProtocol() {
  await requirePageSession(["supervisor", "admin"]);
  return (
    <>
      <div className="page-head"><div><h1>Add protocol</h1></div></div>
      <ProtocolForm />
    </>
  );
}
