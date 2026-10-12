import { requirePageSession } from "@/lib/auth";
import { listDistricts, listSymptoms } from "@/lib/data";
import { NewCaseForm } from "./NewCaseForm";

export const metadata = { title: "New call" };

export default async function NewCasePage() {
  await requirePageSession();
  const [symptoms, districts] = await Promise.all([listSymptoms(), listDistricts()]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New call</h1>
          <p>As you type the complaint, closed cases with similar meaning and matching protocols appear on the right.</p>
        </div>
      </div>
      <NewCaseForm symptoms={symptoms} districts={districts} />
    </>
  );
}
