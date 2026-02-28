
export interface QrItem {
  id: number;
  label: string;
  message: string;
  preventAutoExecute?: boolean;
}

export interface CharacterBookEntry {
  keys: string[];
  keysInput?: string; // UI helper for comma-separated input
  content: string;
  enabled?: boolean;
  insertion_order?: number;
  case_sensitive?: boolean;
  name?: string;
  priority?: number;
  id?: number;
  comment?: string;
  secondary_keys?: string[];
  selective?: boolean;
  constant?: boolean;
  position?: string | number;
}

export interface CharacterBook {
  name?: string;
  description?: string;
  entries: CharacterBookEntry[];
}

export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  firstMessage: string;
  alternate_greetings?: string[];
  avatarUrl: string;
  scenario?: string;
  character_book?: CharacterBook;
  tags?: string[];
  qrList?: QrItem[];
  originalFilename?: string;
  sourceUrl?: string;
  cardUrl?: string;
  creator_notes?: string;
  // Preserved ST fields - must survive import → export round-trip
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  creator?: string;
  character_version?: string;
  extensions?: Record<string, any>;
  // Raw original ST data object — used for lossless export
  rawData?: Record<string, any>;
  // Internal app-only fields (NOT exported to ST format)
  importDate?: number;
  updatedAt?: number;
  extra_qr_data?: any;
  qrFileName?: string;
  isFavorite?: boolean;
  folder?: string;
  importFormat?: 'png' | 'json' | 'unknown';
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export type ViewMode = 'list' | 'edit';
export type Theme = 'dark' | 'light';
