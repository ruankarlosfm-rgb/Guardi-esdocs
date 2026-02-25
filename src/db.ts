import Dexie, { type Table } from 'dexie';

export interface PasswordEntry {
  id?: number;
  site: string;
  username: string;
  category: 'site' | 'email' | 'wifi';
  phone_number?: string;
  encrypted_password: string;
  iv: string;
  tag: string;
  deleted_at?: number | null;
  created_at: number;
}

export interface FolderEntry {
  id?: number;
  name: string;
  parent_id: number | null;
  deleted_at?: number | null;
  created_at: number;
}

export interface DocumentEntry {
  id?: number;
  name: string;
  folder_id: number | null;
  encrypted_image: string;
  iv: string;
  tag: string;
  deleted_at?: number | null;
  created_at: number;
}

export interface ConfigEntry {
  key: string;
  value: string;
}

export class SafeVaultDB extends Dexie {
  passwords!: Table<PasswordEntry>;
  folders!: Table<FolderEntry>;
  documents!: Table<DocumentEntry>;
  config!: Table<ConfigEntry>;

  constructor() {
    super('SafeVaultDB');
    this.version(1).stores({
      passwords: '++id, site, category, deleted_at',
      folders: '++id, name, parent_id, deleted_at',
      documents: '++id, name, folder_id, deleted_at',
      config: 'key'
    });
  }
}

export const db = new SafeVaultDB();
