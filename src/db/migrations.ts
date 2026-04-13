import { db } from './db';

export async function runMigrations() {
  const isMigrated = await db.settings.get('id_migration_v1');
  if (isMigrated?.value === true) return;

  // Legacy migrations for early alpha users are deactivated for production build
  // to prevent schema conflicts with the new Event-Sourced architecture.
  
  await db.settings.put({ key: 'id_migration_v1', value: true });
}
