export const CATEGORIES = [
  "Fever & Infection", "Maternal & Child", "Cardiac", "Respiratory", "Mental Health",
  "Injury", "Poisoning", "Chronic Disease", "Information", "Other",
] as const;
export const SEVERITIES = ["low", "moderate", "high", "critical"] as const;
export const STATUSES = ["open", "in_progress", "escalated", "follow_up", "closed"] as const;
export const LANGUAGES = ["Kannada", "Hindi", "English", "Telugu", "Marathi", "Tamil", "Other"] as const;
export const NOTE_TYPES = ["observation", "advice", "follow_up"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  in_progress: "In progress",
  escalated: "Escalated",
  follow_up: "Follow-up",
  closed: "Closed",
};

export function caseRef(id: number) {
  return `TD-${String(id).padStart(6, "0")}`;
}
