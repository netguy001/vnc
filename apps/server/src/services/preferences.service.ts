import { getDatabase } from '../db/client.js';
import { UserPreferencesDTO, UpdatePreferencesInput } from '@server-console/shared';

const DEFAULTS: UserPreferencesDTO = {
  themeMode: 'dark',
  dashboardRefreshSeconds: 15,
  defaultLandingTab: 'dashboard',
  defaultSshPort: 22,
  defaultSshUsername: 'root',
  defaultVncPort: 5900,
};

export class PreferencesService {
  getPreferences(userId: string): UserPreferencesDTO {
    const db = getDatabase();
    const row = db.get<any>('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
    if (!row) return { ...DEFAULTS };

    return {
      themeMode: row.theme_mode || DEFAULTS.themeMode,
      dashboardRefreshSeconds: row.dashboard_refresh_seconds ?? DEFAULTS.dashboardRefreshSeconds,
      defaultLandingTab: row.default_landing_tab || DEFAULTS.defaultLandingTab,
      defaultSshPort: row.default_ssh_port ?? DEFAULTS.defaultSshPort,
      defaultSshUsername: row.default_ssh_username || DEFAULTS.defaultSshUsername,
      defaultVncPort: row.default_vnc_port ?? DEFAULTS.defaultVncPort,
    };
  }

  updatePreferences(userId: string, input: UpdatePreferencesInput): UserPreferencesDTO {
    const db = getDatabase();
    const current = this.getPreferences(userId);
    const merged: UserPreferencesDTO = { ...current, ...input };
    const now = new Date().toISOString();

    const existing = db.get<{ user_id: string }>('SELECT user_id FROM user_preferences WHERE user_id = ?', [userId]);
    if (existing) {
      db.run(
        `UPDATE user_preferences SET
          theme_mode = ?, dashboard_refresh_seconds = ?, default_landing_tab = ?,
          default_ssh_port = ?, default_ssh_username = ?, default_vnc_port = ?, updated_at = ?
        WHERE user_id = ?`,
        [
          merged.themeMode,
          merged.dashboardRefreshSeconds,
          merged.defaultLandingTab,
          merged.defaultSshPort,
          merged.defaultSshUsername,
          merged.defaultVncPort,
          now,
          userId,
        ]
      );
    } else {
      db.run(
        `INSERT INTO user_preferences (
          user_id, theme_mode, dashboard_refresh_seconds, default_landing_tab,
          default_ssh_port, default_ssh_username, default_vnc_port, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          merged.themeMode,
          merged.dashboardRefreshSeconds,
          merged.defaultLandingTab,
          merged.defaultSshPort,
          merged.defaultSshUsername,
          merged.defaultVncPort,
          now,
        ]
      );
    }

    return merged;
  }
}

export const preferencesService = new PreferencesService();
