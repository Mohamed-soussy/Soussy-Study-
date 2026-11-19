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
  created_at?: string;
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
