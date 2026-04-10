import { vi } from 'vitest';
import 'fake-indexeddb/auto';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// Ensure Dexie finds the fake implementations
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

// Mock window.matchMedia if needed for UI components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock print function
window.print = vi.fn();
