import fs from "fs";
import path from "path";
import { format } from "date-fns";

export const createFileLogger = (basePath: string) => {
  const logsDir = path.join(basePath, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const write = (message: string) => {
    const dateStamp = format(new Date(), "yyyy-MM-dd");
    const filePath = path.join(logsDir, `${dateStamp}.log`);
    fs.appendFileSync(filePath, message + "\n", "utf8");
  };

  return { write };
};

export const formatLogLine = (label: string, action: string, payload?: string) => {
  const timestamp = format(new Date(), "yyyy-MM-dd HH:mm:ss.SSS");
  const header = `[${timestamp}] ${label} ${action}`;
  if (!payload) {
    return header;
  }
  return `${header}\n${payload}`;
};
