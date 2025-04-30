import type { Request, Response, NextFunction } from "express"
import { config } from "../config/server"
import { logger } from "./logger"

// Middleware to authenticate internal service requests
export function authenticateInternalRequest(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers["x-api-key"]

  if (!apiKey || apiKey !== config.internalApiKey) {
    logger.warn(`Unauthorized request to ${req.path} from ${req.ip}`)
    res.status(401).json({ error: "Unauthorized" })
    return
  }

  next()
}
