import type { Express } from "express"
import * as recommenderController from "./recommender"
import { authenticateInternalRequest } from "../utils/auth"

export function setupRoutes(app: Express): void {
  // API health check
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" })
  })

  // Recommendation endpoints (internal API)
  app.get("/recommend/:userId", authenticateInternalRequest, recommenderController.getRecommendations)
  app.get("/popular", authenticateInternalRequest, recommenderController.getPopularPosts)

  // Training endpoints (internal only)
  app.post("/training/trigger", authenticateInternalRequest, recommenderController.triggerTraining)
  app.get("/training/status", authenticateInternalRequest, recommenderController.getTrainingStatus)
}
