export type SettingsForm = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  portName: string;
  baudRate: number;
  pcucode: string;
  sessionTimeoutMinutes: number;
  logRetentionDays: number;
  autoStart: boolean;
};

export type UpdateField = (
  key: keyof SettingsForm,
  value: string | number | boolean
) => void;
