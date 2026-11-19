/** Row types shared by the calendar, Study Hub and chat (see supabase/migrations/0002_calendar_hub.sql). */

export type EventType = "test" | "homework" | "submission" | "event" | "class" | "personal";
export type EventSource = "manual" | "teams" | "platform" | "lesson" | "ai" | "file";
export type EventStatus = "todo" | "in_progress" | "done";

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  subject_code: string | null;
  starts_at: string; // ISO
  ends_at: string | null;
  all_day: boolean;
  description: string | null;
  location: string | null;
  dress_code: string | null;
  estimated_minutes: number | null;
  source: EventSource;
  confidence: number | null;
  status: EventStatus;
  in_review: boolean;
  reminders: number[];
  parent_id: string | null;
  repeat_every_days: number | null;
  repeat_until: string | null;
  linked_file_ids: string[];
  /** Id in the other system (.ics UID, Teams assignment id); re-syncs update instead of copying. */
  external_id?: string | null;
  /** Everywhere this item was seen: a lesson moment, Teams, a calendar feed (section 10.4). */
  origins?: Origin[];
  /** Set on a found item whose due date differs from an item already saved. */
  conflict_of?: string | null;
  created_at?: string;
}

export type OriginKind = "lesson" | "teams" | "outlook" | "ics" | "paste";

export interface Origin {
  kind: OriginKind;
  /** Short label: "Physics lesson, 12 Nov", "Teams: Physics HL". */
  label: string;
  /** In-app or external link; lesson links jump to the exact moment (?t=seconds). */
  href?: string;
  /** For lessons: seconds into the recording, and the teacher's words. */
  at?: number;
  quote?: string;
  /** The due date this source gave (ISO), to show "Teams says Thu, lesson says Sun". */
  due?: string;
}

export type NewEvent = Omit<CalendarEvent, "id" | "created_at">;

export interface Folder {
  id: string;
  parent_id: string | null;
  name: string;
  subject_code: string | null;
  sort: number;
}

export type FileStatus = "uploaded" | "processing" | "ready" | "error";

export interface VaultFile {
  id: string;
  folder_id: string | null;
  name: string;
  mime: string;
  size_bytes: number;
  storage_path: string;
  status: FileStatus;
  error: string | null;
  summary: string | null;
  subject_code: string | null;
  unit: string | null;
  topic: string | null;
  key_terms: string[];
  page_count: number | null;
  created_at: string;
}

export interface ChunkHit {
  file_id: string;
  file_name: string;
  page: number;
  content: string;
  rank: number;
}

export interface FileNote {
  id: string;
  file_id: string;
  page: number;
  quote: string | null;
  note: string | null;
  color: string;
  created_at: string;
}

export interface Chat {
  id: string;
  title: string;
  subject_code: string | null;
  source_file_ids: string[];
  source_urls: string[];
  sources_answered: boolean;
  updated_at: string;
}

export interface Citation {
  n: number;
  file_id: string | null;
  file_name: string;
  page: number | null;
  url?: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
}
