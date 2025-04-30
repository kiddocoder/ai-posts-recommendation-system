import { triggerModelTraining } from "../src/training/trainer"
import { logger } from "../src/utils/logger"

async function main() {
  try {
    logger.info("Starting manual training process")

    const trainingJob = await triggerModelTraining()

    logger.info(`Training job ${trainingJob.id} started with status: ${trainingJob.status}`)

    // Wait for training to complete
    await new Promise<void>((resolve) => {
      const checkStatus = setInterval(async () => {
        if (["completed", "failed"].includes(trainingJob.status)) {
          clearInterval(checkStatus)

          if (trainingJob.status === "completed") {
            logger.info(`Training job ${trainingJob.id} completed successfully`)
          } else {
            logger.error(`Training job ${trainingJob.id} failed: ${trainingJob.error}`)
          }

          resolve()
        }
      }, 5000)
    })
  } catch (error) {
    logger.error("Error in manual training process", error)
    process.exit(1)
  }
}

main()
