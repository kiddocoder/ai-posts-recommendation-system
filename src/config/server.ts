// Server configuration
export const config = {
  port: Number.parseInt(process.env.PORT || "3002"),
  internalApiKey: process.env.INTERNAL_API_KEY || "default-internal-key",
  logLevel: process.env.LOG_LEVEL || "info",
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
}
