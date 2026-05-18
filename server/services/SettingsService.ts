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
    fs.writeFileSync(settingsPath, JSON.stringify({ ...current, ...updates }, null, 2), 'utf8');
  }
}
