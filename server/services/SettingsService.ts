import fs from 'fs';
import path from 'path';

export class SettingsService {
  private getSettingsPath(): string {
    return process.env.SETTINGS_PATH || path.join(process.cwd(), 'settings.json');
  }

  public getSettings(): any {
    const settingsPath = this.getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return {};
  }

  public updateSettings(updates: any): void {
    const settingsPath = this.getSettingsPath();
    const current = this.getSettings();
    
    // Deep merge to avoid overwriting nested properties
    const merged = { ...current };
    for (const key of Object.keys(updates)) {
      if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
        merged[key] = { ...(merged[key] || {}), ...updates[key] };
      } else {
        merged[key] = updates[key];
      }
    }
    
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
  }
}
