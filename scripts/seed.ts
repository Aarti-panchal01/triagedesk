/**
 * Loads demo data: users (bcrypt), protocols and cases (with embeddings),
 * callers, symptoms links, notes, escalations and callbacks.
 * Run after db:migrate.  Usage: npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { caseEmbeddingText, embed, protocolEmbeddingText, toPgVector } from "../src/lib/embeddings";

const PASSWORD = "Triage@123";

const USERS = [
  { name: "Asha Admin", email: "admin@triagedesk.in", role: "admin", cap: 15 },
  { name: "Kavya Rao", email: "supervisor@triagedesk.in", role: "supervisor", cap: 15 },
  { name: "Imran Sheikh", email: "supervisor2@triagedesk.in", role: "supervisor", cap: 15 },
  { name: "Meera Kulkarni", email: "agent1@triagedesk.in", role: "agent", cap: 12 },
  { name: "Ravi Gowda", email: "agent2@triagedesk.in", role: "agent", cap: 12 },
  { name: "Sunita Patil", email: "agent3@triagedesk.in", role: "agent", cap: 10 },
  { name: "Arjun Nair", email: "agent4@triagedesk.in", role: "agent", cap: 10 },
] as const;

const PROTOCOLS = [
  { code: "FEV-01", title: "Fever in adults", category: "Fever & Infection", content:
    "Ask how long the fever has lasted, the highest temperature measured, and whether there is chills, body ache, cough, burning urine or rash. Advise rest, plenty of fluids and paracetamol only as directed on the pack or by a doctor. Use a wet cloth sponge for comfort. Refer to the nearest PHC within 24 hours if fever lasts more than 3 days, comes with chills every alternate day (suspect malaria), or the caller lives in an area with dengue cases. Advise immediate hospital visit for confusion, stiff neck, breathlessness, bleeding, or inability to keep fluids down." },
  { code: "FEV-02", title: "Fever with rash in children", category: "Fever & Infection", content:
    "Ask the child's age, fever duration, type of rash (spots, blisters, blanching or not), and vaccination status. Keep the child hydrated and lightly clothed. Do not give aspirin to children. Warning signs needing the hospital today: rash that does not fade when pressed with a glass, bleeding from gums or nose, persistent vomiting, severe abdominal pain, unusual sleepiness, or reduced urine. Suspect dengue in season and measles if there is cough, red eyes and running nose before the rash. Advise isolation from other children and a PHC visit for testing." },
  { code: "DIA-01", title: "Diarrhoea and dehydration", category: "Fever & Infection", content:
    "Ask number of loose stools, vomiting, blood in stool, and urine output. Advise ORS after every loose stool, prepared with one packet in one litre of clean drinking water and used within 24 hours. For children, continue breastfeeding and normal food, and give zinc tablets for 14 days as prescribed by the ASHA or PHC. Signs of severe dehydration: sunken eyes, very dry mouth, no urine for 6 hours, the child too weak to drink. These need the hospital immediately. Blood in stool also needs a doctor the same day." },
  { code: "MAT-01", title: "Danger signs in pregnancy", category: "Maternal & Child", content:
    "Any of these is an emergency: vaginal bleeding, severe headache with blurred vision, fits, swelling of face and hands, high fever, severe abdominal pain, water leaking, or the baby moving less than usual. Ask the weeks of pregnancy and where antenatal care is registered. Advise calling 108 or going directly to the nearest First Referral Unit or district hospital with the MCP card. Do not wait for the morning. Inform the ASHA worker. Mark the case high or critical and escalate if the caller cannot arrange transport." },
  { code: "MAT-02", title: "Newborn care questions", category: "Maternal & Child", content:
    "Encourage exclusive breastfeeding for six months and skin to skin contact. Keep the cord clean and dry with nothing applied. Danger signs in a newborn: not feeding well, fever or feeling cold, fast or difficult breathing, yellow palms and soles, fits, or pus from the cord. Any danger sign means the baby must be seen at a hospital today. For routine questions on vaccination, refer to the immunisation schedule on the MCP card and the nearest anganwadi or PHC session day." },
  { code: "CAR-01", title: "Suspected heart attack", category: "Cardiac", content:
    "Chest pain or pressure lasting more than a few minutes, especially spreading to the arm, jaw or back, with sweating, breathlessness or nausea, is a possible heart attack. Ask the caller to call 108 now or take the patient to the nearest hospital with a cardiac facility. Keep the patient seated and at rest, loosen tight clothing, and do not let them walk or drive. Do not give food. If the patient has been prescribed medicine for chest pain by a doctor, they may use it as prescribed. If the patient collapses and is not breathing, guide the caller through hands only CPR until help arrives. Always mark critical." },
  { code: "RES-01", title: "Breathlessness and asthma", category: "Respiratory", content:
    "Ask if breathlessness is new or known asthma or COPD, whether the patient can speak full sentences, lip colour, and fever or cough. For known asthma, sit upright and use the prescribed reliever inhaler as the doctor advised. Emergency signs: cannot speak in sentences, blue or grey lips, confusion, breathing very fast, or no improvement after the reliever. These need 108 immediately. New breathlessness with fever and cough for more than a few days should be seen at the PHC for a chest examination and tuberculosis screening if cough lasts two weeks." },
  { code: "MHL-01", title: "Emotional distress and self-harm risk", category: "Mental Health", content:
    "Listen without judging and stay on the line. Ask directly and calmly whether the caller is thinking of harming themselves and whether they are safe right now. If there is immediate danger, ask for their location and alert emergency services through the supervisor. Encourage them to stay with a trusted person and remove anything they could use to hurt themselves. Connect them to Tele MANAS on 14416 for continued counselling. Never promise secrecy you cannot keep. Always escalate to a supervisor and schedule a callback within 24 hours." },
  { code: "INJ-01", title: "Snake bite first aid", category: "Injury", content:
    "Keep the person calm and still. Remove rings, watches and tight clothing near the bite. Keep the bitten limb still and at or below heart level, like a fracture, using a splint if possible. Do not cut the wound, suck the venom, apply ice, or tie a tight tourniquet. Do not try to catch the snake. Take the person to the nearest hospital that stocks anti snake venom by the fastest transport, calling 108. Note the time of the bite. Swelling, bleeding, drooping eyelids or difficulty breathing mean the case is critical." },
  { code: "INJ-02", title: "Burns first aid", category: "Injury", content:
    "Cool the burn under clean running tap water for 20 minutes. Remove jewellery and clothing near the burn unless stuck to the skin. Do not apply ice, toothpaste, oil, or home remedies. Cover loosely with a clean cloth or cling film. Burns larger than the patient's palm, burns on the face, hands, feet or genitals, electrical or chemical burns, and any burn in a small child or elderly person need hospital care. Give fluids if the person is awake and not vomiting." },
  { code: "POI-01", title: "Poisoning and pesticide ingestion", category: "Poisoning", content:
    "Treat every pesticide or chemical ingestion as an emergency, whether accidental or intentional. Do not make the person vomit and do not give milk, oil or salt water. If chemical is on the skin or clothes, remove the clothes and wash the skin with plenty of water. Take the person to the nearest hospital immediately by 108 and carry the container or label. Watch for breathing difficulty, excessive saliva, small pupils, fits or drowsiness. If ingestion may be intentional, also follow MHL-01 once the person is safe." },
  { code: "CHR-01", title: "High blood sugar and diabetes care", category: "Chronic Disease", content:
    "Ask the reading, whether the patient is on tablets or insulin, missed doses, and symptoms like excessive thirst, frequent urination, vomiting, or drowsiness. Do not advise changing the dose; that must come from the treating doctor. Encourage water, regular meals and a visit to the PHC or NCD clinic within a day or two for readings that stay high. Vomiting, drowsiness, deep fast breathing, or a reading the meter shows as HI needs the hospital today. Remind about foot care and regular follow up at the NCD clinic." },
  { code: "INF-01", title: "Medicine and service information", category: "Information", content:
    "For questions about where to get medicines, refer callers to the nearest Jan Aushadhi Kendra or government hospital pharmacy where essential medicines are free. Do not recommend new medicines or doses over the phone. For questions about schemes, explain how to check eligibility under Ayushman Bharat and the state health scheme at the nearest hospital Arogya Mitra desk. For ambulance services, the number is 108; for mental health support, Tele MANAS is 14416." },
  { code: "OTH-01", title: "Heat exhaustion and heat stroke", category: "Other", content:
    "Heat exhaustion causes heavy sweating, weakness, dizziness, headache and nausea after time in the sun. Move the person to shade, loosen clothing, sponge with cool water, fan them, and give ORS or water in small sips if fully awake. Heat stroke is an emergency: very high body temperature, confusion, fainting, fits, or hot dry skin. Call 108 immediately while cooling the person. Advise outdoor workers to drink water often, rest in shade, and avoid work in peak afternoon heat." },
];

// [name, phone, age, gender, district, language]
const CALLERS: [string, string, number | null, "M" | "F" | "O" | null, string, string][] = [
  ["Lakshmi Devi", "9845012301", 34, "F", "Bidar", "Kannada"],
  ["Ramesh Patil", "9845012302", 58, "M", "Kalaburagi", "Kannada"],
  ["Fatima Begum", "9845012303", 27, "F", "Bengaluru Urban", "Hindi"],
  ["Suresh Kumar", "9845012304", 45, "M", "Mysuru", "Kannada"],
  ["Anitha Shetty", "9845012305", 31, "F", "Udupi", "Kannada"],
  ["Mohammed Ali", "9845012306", 62, "M", "Bidar", "Hindi"],
  ["Pooja Reddy", "9845012307", 24, "F", "Ballari", "Telugu"],
  ["Basavaraj H", "9845012308", 40, "M", "Raichur", "Kannada"],
  ["Gayatri Joshi", "9845012309", 29, "F", "Belagavi", "Marathi"],
  ["Venkatesh Rao", "9845012310", 70, "M", "Tumakuru", "Kannada"],
  ["Shabana Khan", "9845012311", 36, "F", "Hubballi-Dharwad", "Hindi"],
  ["Manjunath S", "9845012312", 50, "M", "Shivamogga", "Kannada"],
  ["Divya Nair", "9845012313", 22, "F", "Mangaluru", "English"],
  ["Hanumanthappa", "9845012314", 66, "M", "Vijayapura", "Kannada"],
  ["Kavitha M", "9845012315", 38, "F", "Hassan", "Kannada"],
  ["Rahul Deshpande", "9845012316", 19, "M", "Belagavi", "Marathi"],
  ["Sangeetha Gowda", "9845012317", 42, "F", "Bengaluru Rural", "Kannada"],
  ["Abdul Rehman", "9845012318", 55, "M", "Kalaburagi", "Hindi"],
  ["Nagaraj K", "9845012319", 33, "M", "Bidar", "Kannada"],
  ["Rekha Pawar", "9845012320", 26, "F", "Bidar", "Marathi"],
  ["Prakash Hegde", "9845012321", 47, "M", "Udupi", "Kannada"],
  ["Sunanda B", "9845012322", 61, "F", "Mysuru", "Kannada"],
];

type SeedCase = {
  caller: number; agent: number; hoursAgo: number; category: string;
  severity: "low" | "moderate" | "high" | "critical"; complaint: string; symptoms: string[];
  closeAfter?: number; resolution?: string; protocol?: string; followUpDue?: number; escalate?: string;
};

// caller/agent are indexes into CALLERS / agents list
const CASES: SeedCase[] = [
  { caller: 0, agent: 0, hoursAgo: 310, category: "Fever & Infection", severity: "moderate", symptoms: ["Fever", "Rash"],
    complaint: "Her 6 year old son has had fever for 3 days and today red spots appeared on his arms and legs. He is eating less.",
    closeAfter: 2, protocol: "FEV-02",
    resolution: "Checked warning signs: rash fades on pressing, no bleeding, passing urine. Advised fluids, paracetamol as per label, no aspirin. Referred to Bidar PHC for dengue test. Callback next day: test negative, fever settling." },
  { caller: 1, agent: 1, hoursAgo: 300, category: "Cardiac", severity: "critical", symptoms: ["Chest pain"],
    complaint: "Father aged 58 complaining of heavy pressure in the chest since 20 minutes, sweating a lot and pain going to left arm.",
    closeAfter: 1, protocol: "CAR-01",
    resolution: "Treated as possible heart attack. Guided family to call 108, kept patient seated, no walking. Ambulance reached in 18 minutes, admitted to GIMS Kalaburagi cardiac unit. Supervisor informed." },
  { caller: 2, agent: 2, hoursAgo: 290, category: "Maternal & Child", severity: "high", symptoms: ["Reduced fetal movement"],
    complaint: "Pregnant 8 months, says the baby has not kicked much since morning and she feels worried.",
    closeAfter: 3, protocol: "MAT-01",
    resolution: "Explained that reduced movement is a danger sign. Advised to go to Vani Vilas hospital labour ward immediately with MCP card. Husband arranged auto. Follow-up call: monitoring normal, mother and baby fine." },
  { caller: 3, agent: 3, hoursAgo: 280, category: "Fever & Infection", severity: "moderate", symptoms: ["Loose motions", "Vomiting", "Dehydration signs"],
    complaint: "Had loose motions about 8 times since last night and vomited twice, feeling very weak and mouth is dry.",
    closeAfter: 5, protocol: "DIA-01",
    resolution: "Advised ORS after every loose stool and small frequent sips. Urine passed 2 hours ago so not severely dehydrated. Told to go to hospital if no urine for 6 hours or blood in stool. Callback: improved by evening." },
  { caller: 4, agent: 0, hoursAgo: 260, category: "Mental Health", severity: "high", symptoms: ["Low mood or anxiety", "Thoughts of self-harm"],
    complaint: "Young woman crying, says she has failed her exams again, cannot face her family and does not want to live.",
    closeAfter: 6, protocol: "MHL-01", escalate: "Caller expressed self-harm thoughts; supervisor to stay informed.",
    resolution: "Stayed on the line, caller agreed she was safe and with her sister. Connected to Tele MANAS 14416 for counselling. Supervisor escalation resolved after warm handover. Callback next day: attending counselling." },
  { caller: 5, agent: 1, hoursAgo: 240, category: "Chronic Disease", severity: "moderate", symptoms: ["High blood sugar reading", "Dizziness"],
    complaint: "Diabetic for 10 years, sugar reading 320 this morning, feeling thirsty and dizzy. Missed tablets for two days.",
    closeAfter: 2, protocol: "CHR-01",
    resolution: "No vomiting or drowsiness. Advised to restart tablets as prescribed, drink water, and visit Bidar NCD clinic next morning. Told red flags for same-day hospital visit. Callback: seen at NCD clinic, dose adjusted by doctor." },
  { caller: 6, agent: 2, hoursAgo: 220, category: "Injury", severity: "critical", symptoms: ["Snake or animal bite"],
    complaint: "Farmer bitten by a snake on the foot in the field 15 minutes ago, foot is swelling. Family wants to tie a rope and cut the wound.",
    closeAfter: 2, protocol: "INJ-01",
    resolution: "Stopped family from cutting or tying tight rope. Guided to keep leg still with a splint and go to VIMS Ballari which has anti snake venom. 108 dispatched. Received ASV, stable." },
  { caller: 7, agent: 3, hoursAgo: 200, category: "Poisoning", severity: "critical", symptoms: ["Suspected poisoning", "Vomiting"],
    complaint: "Brother drank some pesticide from a bottle kept in the shed, vomiting and sweating a lot.",
    closeAfter: 2, protocol: "POI-01",
    resolution: "Advised not to induce vomiting or give milk. Removed soaked clothes, washed skin. Took container to Raichur RIMS by 108. Admitted to ICU. Informed supervisor to check intent and arrange mental health callback." },
  { caller: 8, agent: 0, hoursAgo: 180, category: "Respiratory", severity: "high", symptoms: ["Breathlessness", "Cough"],
    complaint: "Known asthma patient, breathing very hard tonight, inhaler not helping much, can only speak few words.",
    closeAfter: 1, protocol: "RES-01",
    resolution: "Cannot speak in full sentences so treated as emergency. Sat upright, used reliever as prescribed, called 108. Nebulised at Belagavi district hospital and discharged next morning." },
  { caller: 9, agent: 1, hoursAgo: 170, category: "Other", severity: "high", symptoms: ["Dizziness", "Confusion or drowsiness"],
    complaint: "Elderly man was working in the field in afternoon sun, now confused and skin is very hot and dry.",
    closeAfter: 2, protocol: "OTH-01",
    resolution: "Suspected heat stroke. Guided cooling with wet cloth and fanning while 108 came. Admitted at Tumakuru district hospital, recovered. Advised family about working hours in summer." },
  { caller: 10, agent: 2, hoursAgo: 160, category: "Maternal & Child", severity: "moderate", symptoms: ["Fever"],
    complaint: "Newborn baby 10 days old feels warm and is feeding less than usual since morning.",
    closeAfter: 2, protocol: "MAT-02",
    resolution: "Fever and poor feeding in a newborn are danger signs. Advised immediate visit to KIMS Hubballi paediatric ward. Baby admitted for observation, sepsis ruled out." },
  { caller: 11, agent: 3, hoursAgo: 150, category: "Information", severity: "low", symptoms: ["Medication query"],
    complaint: "Wants to know where he can get blood pressure tablets for free near Shivamogga.",
    closeAfter: 0.3, protocol: "INF-01",
    resolution: "Directed to McGann district hospital pharmacy and nearest Jan Aushadhi Kendra. Explained NCD clinic days for regular BP check." },
  { caller: 12, agent: 0, hoursAgo: 140, category: "Injury", severity: "moderate", symptoms: ["Burn"],
    complaint: "Hot oil spilled on her hand while cooking, burn about the size of her palm, very painful.",
    closeAfter: 1, protocol: "INJ-02",
    resolution: "Cooled under running water for 20 minutes, removed ring, covered with clean cloth. Advised against toothpaste. Hand burn so referred to Wenlock hospital for dressing." },
  { caller: 13, agent: 1, hoursAgo: 130, category: "Cardiac", severity: "high", symptoms: ["Palpitations", "Dizziness"],
    complaint: "Feeling heart beating very fast and irregular since one hour, slight dizziness, no chest pain.",
    closeAfter: 3, protocol: "CAR-01",
    resolution: "No chest pain or breathlessness. Advised rest and same-day visit to Vijayapura district hospital for ECG. ECG showed atrial fibrillation; started treatment by cardiologist." },
  { caller: 14, agent: 2, hoursAgo: 120, category: "Fever & Infection", severity: "moderate", symptoms: ["Fever", "Joint or body pain", "Headache"],
    complaint: "High fever for 4 days with severe body pain and pain behind the eyes, many dengue cases in the village.",
    closeAfter: 4, protocol: "FEV-01",
    resolution: "Suspected dengue. No bleeding or vomiting. Advised fluids, paracetamol only, no painkillers like ibuprofen. Referred to Hassan PHC for NS1 test: positive. Platelets monitored, recovered at home." },
  { caller: 15, agent: 3, hoursAgo: 110, category: "Mental Health", severity: "moderate", symptoms: ["Low mood or anxiety"],
    complaint: "College student cannot sleep, heart racing before exams, feels anxious all the time for the last month.",
    closeAfter: 1, protocol: "MHL-01",
    resolution: "No self-harm thoughts. Discussed sleep routine and breathing exercise. Connected to Tele MANAS for counselling sessions. Advised college counsellor." },
  { caller: 0, agent: 0, hoursAgo: 100, category: "Fever & Infection", severity: "moderate", symptoms: ["Cough", "Fever", "Sore throat"],
    complaint: "Same caller as before, now her husband has cough and fever for 5 days with sore throat.",
    closeAfter: 2, protocol: "FEV-01",
    resolution: "No breathlessness. Advised rest, fluids and PHC visit for examination. Told to test for TB if cough continues beyond 2 weeks." },
  { caller: 16, agent: 1, hoursAgo: 90, category: "Fever & Infection", severity: "moderate", symptoms: ["Loose motions", "Abdominal pain"],
    complaint: "Two children in the house have stomach pain and watery loose motions after eating at a function.",
    closeAfter: 3, protocol: "DIA-01",
    resolution: "Suspected food poisoning. ORS and zinc as per ASHA, continue food. Informed PHC for possible outbreak check as more families affected." },
  { caller: 17, agent: 2, hoursAgo: 80, category: "Respiratory", severity: "moderate", symptoms: ["Cough", "Breathlessness"],
    complaint: "Cough for more than three weeks with weight loss and evening fever.",
    closeAfter: 2, protocol: "RES-01",
    resolution: "Suspected tuberculosis. Referred to Kalaburagi district TB centre for sputum test under NTEP; explained free treatment. Test positive, started on treatment." },
  { caller: 5, agent: 1, hoursAgo: 70, category: "Chronic Disease", severity: "high", symptoms: ["High blood sugar reading", "Vomiting", "Confusion or drowsiness"],
    complaint: "Diabetic father vomiting since morning, very drowsy and breathing fast, meter shows HI.",
    closeAfter: 1, protocol: "CHR-01",
    resolution: "Red flags for diabetic emergency. Advised immediate hospital by 108. Admitted at Bidar BRIMS with ketoacidosis, recovering." },
  // ---- still open ----
  { caller: 18, agent: 0, hoursAgo: 30, category: "Fever & Infection", severity: "moderate", symptoms: ["Fever", "Headache"],
    complaint: "Fever with chills coming every alternate day for a week, sweating after the fever goes down.", followUpDue: -2 },
  { caller: 19, agent: 0, hoursAgo: 20, category: "Maternal & Child", severity: "moderate", symptoms: ["Swelling of feet or face", "Headache"],
    complaint: "Seven months pregnant, feet and face are swollen since two days and she has a headache.", followUpDue: 6 },
  { caller: 20, agent: 1, hoursAgo: 16, category: "Injury", severity: "low", symptoms: ["Joint or body pain"],
    complaint: "Twisted ankle while climbing stairs, swelling but can walk slowly." },
  { caller: 21, agent: 1, hoursAgo: 12, category: "Cardiac", severity: "critical", symptoms: ["Chest pain", "Breathlessness"],
    complaint: "Mother aged 61 has tight chest pain and breathlessness, she is a diabetic and sweating." },
  { caller: 3, agent: 2, hoursAgo: 9, category: "Information", severity: "low", symptoms: ["Medication query"],
    complaint: "Asking whether his Ayushman Bharat card can be used at a private hospital in Mysuru." },
  { caller: 1, agent: 3, hoursAgo: 6, category: "Chronic Disease", severity: "moderate", symptoms: ["Dizziness"],
    complaint: "After heart attack last week, father feels dizzy when standing up and is worried about his new tablets.", followUpDue: 18 },
  { caller: 6, agent: 2, hoursAgo: 4, category: "Mental Health", severity: "moderate", symptoms: ["Low mood or anxiety"],
    complaint: "Since the snake bite incident he is not sleeping, keeps getting nightmares and is scared to go to the field.",
    escalate: "Needs a counsellor callback, patient anxious after trauma." },
  { caller: 9, agent: 3, hoursAgo: 2, category: "Other", severity: "moderate", symptoms: ["Dizziness"],
    complaint: "Felt very dizzy and weak after working in the sun today, sweating a lot, now resting in shade." },
  { caller: 7, agent: 0, hoursAgo: 1, category: "Poisoning", severity: "high", symptoms: ["Suspected poisoning"],
    complaint: "Child may have swallowed some kerosene from a bottle at home, coughing a little." },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new Client({ connectionString: url });
  await db.connect();

  console.log(`Embedding provider: ${process.env.EMBEDDING_PROVIDER ?? "local"} (first local run downloads the model)`);
  const protoVecs = [];
  for (const p of PROTOCOLS) protoVecs.push(toPgVector(await embed(protocolEmbeddingText(p))));
  const caseVecs = [];
  for (const c of CASES) {
    caseVecs.push(toPgVector(await embed(caseEmbeddingText({ category: c.category, chief_complaint: c.complaint, resolution_notes: c.resolution }))));
  }
  console.log(`Embedded ${protoVecs.length} protocols and ${caseVecs.length} cases.`);

  const hash = await bcrypt.hash(PASSWORD, 10);
  try {
    await db.query("BEGIN");
    await db.query("TRUNCATE app_user, caller, protocol, help_case, case_symptom, case_note, escalation, follow_up, audit_log RESTART IDENTITY CASCADE");

    const userIds: Record<string, number> = {};
    for (const u of USERS) {
      const r = await db.query("INSERT INTO app_user (full_name, email, password_hash, role, max_open_cases) VALUES ($1,$2,$3,$4,$5) RETURNING user_id",
        [u.name, u.email, hash, u.role, u.cap]);
      userIds[u.email] = r.rows[0].user_id;
    }
    const admin = userIds["admin@triagedesk.in"];
    const supervisor = userIds["supervisor@triagedesk.in"];
    const agents = USERS.filter((u) => u.role === "agent").map((u) => userIds[u.email]);
    await db.query("SELECT set_config('app.user_id', $1, true)", [String(admin)]);

    const protoIds: Record<string, number> = {};
    for (let i = 0; i < PROTOCOLS.length; i++) {
      const p = PROTOCOLS[i];
      const r = await db.query("INSERT INTO protocol (code, title, category, content, created_by, embedding) VALUES ($1,$2,$3,$4,$5,$6::vector) RETURNING protocol_id",
        [p.code, p.title, p.category, p.content, supervisor, protoVecs[i]]);
      protoIds[p.code] = r.rows[0].protocol_id;
    }

    const callerIds: number[] = [];
    for (const [name, phone, age, gender, district, lang] of CALLERS) {
      const r = await db.query(
        `INSERT INTO caller (full_name, phone, age, gender, district_id, preferred_language, created_at)
         VALUES ($1,$2,$3,$4,(SELECT district_id FROM district WHERE name = $5),$6, now() - interval '20 days') RETURNING caller_id`,
        [name, phone, age, gender, district, lang]);
      callerIds.push(r.rows[0].caller_id);
    }

    const symptomIds = new Map<string, number>(
      (await db.query("SELECT symptom_id, name FROM symptom")).rows.map((r) => [r.name, r.symptom_id]));

    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];
      const agentId = agents[c.agent];
      const closed = c.resolution != null;
      const r = await db.query(
        `INSERT INTO help_case (caller_id, created_by, assigned_to, chief_complaint, category, severity, status,
                                resolution_notes, opened_at, closed_at, applied_protocol_id, embedding)
         VALUES ($1,$2,$2,$3,$4,$5,$6::case_status,$7, now() - make_interval(mins => $8),
                 CASE WHEN $6::case_status = 'closed' THEN now() - make_interval(mins => $8) + make_interval(mins => $9) END,
                 $10, $11::vector)
         RETURNING case_id`,
        [callerIds[c.caller], agentId, c.complaint, c.category, c.severity, closed ? "closed" : "open",
         c.resolution ?? null, Math.round(c.hoursAgo * 60), Math.round((c.closeAfter ?? 0) * 60),
         c.protocol ? protoIds[c.protocol] : null, caseVecs[i]]);
      const caseId = r.rows[0].case_id;
      await db.query(`UPDATE help_case SET updated_at = coalesce(closed_at, opened_at) WHERE case_id = $1`, [caseId]);

      for (const s of c.symptoms) {
        const sid = symptomIds.get(s);
        if (!sid) throw new Error(`Unknown symptom ${s}`);
        await db.query("INSERT INTO case_symptom (case_id, symptom_id) VALUES ($1,$2)", [caseId, sid]);
      }
      await db.query(`INSERT INTO case_note (case_id, author_id, note_type, body, created_at)
                      VALUES ($1,$2,'system','Call registered.', now() - make_interval(mins => $3))`,
        [caseId, agentId, Math.round(c.hoursAgo * 60)]);
      if (closed) {
        await db.query(`INSERT INTO case_note (case_id, author_id, note_type, body, created_at)
                        SELECT case_id, $2, 'advice', $3, closed_at FROM help_case WHERE case_id = $1`,
          [caseId, agentId, c.resolution]);
      } else {
        await db.query(`INSERT INTO case_note (case_id, author_id, note_type, body) VALUES ($1,$2,'observation',$3)`,
          [caseId, agentId, "Caller details confirmed, assessing further."]);
        await db.query("UPDATE help_case SET status = 'in_progress' WHERE case_id = $1 AND status = 'open' AND $2::boolean", [caseId, c.hoursAgo > 3]);
      }

      if (c.escalate) {
        await db.query(`INSERT INTO escalation (case_id, raised_by, assigned_supervisor, reason, status, created_at, resolved_at)
                        VALUES ($1,$2,$3,$4,$5, now() - make_interval(mins => $6), $7::timestamptz)`,
          [caseId, agentId, supervisor, c.escalate, closed ? "resolved" : "pending",
           Math.round(c.hoursAgo * 60) - 10, closed ? new Date(Date.now() - (c.hoursAgo - (c.closeAfter ?? 1)) * 3600_000) : null]);
        if (!closed) await db.query("UPDATE help_case SET status = 'escalated' WHERE case_id = $1", [caseId]);
      }
      if (c.followUpDue != null) {
        await db.query(`INSERT INTO follow_up (case_id, created_by, scheduled_for, created_at)
                        VALUES ($1,$2, now() + make_interval(mins => $3), now() - make_interval(mins => $4))`,
          [caseId, agentId, Math.round(c.followUpDue * 60), Math.round(c.hoursAgo * 60)]);
        await db.query("UPDATE help_case SET status = 'follow_up' WHERE case_id = $1 AND status IN ('open','in_progress')", [caseId]);
      }
    }
    // Auto-escalations created by the trigger during seeding should carry the case's time, not now()
    await db.query(`UPDATE escalation e SET created_at = c.opened_at + interval '1 minute'
                      FROM help_case c WHERE c.case_id = e.case_id AND e.reason LIKE 'Auto-escalated%'`);
    await db.query("COMMIT");

    const summary = await db.query(`SELECT status, count(*)::int AS n FROM help_case GROUP BY status ORDER BY status`);
    console.log("Cases by status:", summary.rows.map((r) => `${r.status}=${r.n}`).join(", "));
    console.log(`\nSeeded. Sign in with any of:\n${USERS.map((u) => `  ${u.email.padEnd(28)} ${u.role}`).join("\n")}\nPassword for all: ${PASSWORD}`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
