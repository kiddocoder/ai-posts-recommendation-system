import { createClient } from "redis"
import { config } from "../config/server"
import { logger } from "./logger"

// Redis client for metrics
let metricsClient: ReturnType<typeof createClient> | null = null

// Initialize Redis client for metrics
async function getMetricsClient() {
  if (!metricsClient) {
    metricsClient = createClient({
      url: config.redis.url,
    })

    metricsClient.on("error", (err) => {
      logger.error("Metrics Redis client error", err)
    })

    await metricsClient.connect()
  }

  return metricsClient
}

// Record a metric
export async function recordMetric(metricName: string, data: Record<string, any>): Promise<void> {
  try {
    const client = await getMetricsClient()

    // Add timestamp
    const metricData = {
      ...data,
      timestamp: Date.now(),
    }

    // Store in Redis list
    await client.rPush(`metrics:${metricName}`, JSON.stringify(metricData))

    // Trim list to prevent unbounded growth
    await client.lTrim(`metrics:${metricName}`, -1000, -1)
  } catch (error) {
    logger.error(`Error recording metric ${metricName}`, error)
    // Continue execution even if metrics recording fails
  }
}

// Get metrics for a specific type
export async function getMetrics(metricName: string, limit = 100): Promise<any[]> {
  try {
    const client = await getMetricsClient()

    // Get metrics from Redis list
    const metrics = await client.lRange(`metrics:${metricName}`, -limit, -1)

    // Parse JSON
    return metrics.map((m) => JSON.parse(m))
  } catch (error) {
    logger.error(`Error getting metrics for ${metricName}`, error)
    return []
  }
}

// Calculate average response time
export async function getAverageResponseTime(
  timeWindow = 3600000, // 1 hour in milliseconds
): Promise<number> {
  try {
    const metrics = await getMetrics("recommendation_request", 1000)

    const now = Date.now()
    const recentMetrics = metrics.filter((m) => now - m.timestamp < timeWindow)

    if (recentMetrics.length === 0) {
      return 0
    }

    const totalTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0)
    return totalTime / recentMetrics.length
  } catch (error) {
    logger.error("Error calculating average response time", error)
    return 0
  }
}
