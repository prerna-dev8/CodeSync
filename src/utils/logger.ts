type Level = "info" | "warn" | "error";

const log = (level: Level, message: string, meta?: object): void => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta }));
};

export default {
  info: (msg: string, meta?: object) => log("info", msg, meta),
  warn: (msg: string, meta?: object) => log("warn", msg, meta),
  error: (msg: string, meta?: object) => log("error", msg, meta),
};
