import fs from "fs";
import path from "path";
import { differenceInDays, parseISO } from "date-fns";

export const rotateLogs = (basePath: string, retentionDays: number) => {
  const logsDir = path.join(basePath, "logs");
  if (!fs.existsSync(logsDir)) {
    return;
  }

  const files = fs.readdirSync(logsDir);
  const now = new Date();

  files.forEach((file) => {
    if (!file.endsWith(".log")) {
      return;
    }

    const datePart = file.replace(".log", "");
    const date = parseISO(datePart);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    const age = differenceInDays(now, date);
    if (age > retentionDays) {
      fs.unlinkSync(path.join(logsDir, file));
    }
  });
};
