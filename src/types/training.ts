// Training job status
export type TrainingJobStatus =
  | "preparing"
  | "cleaning"
  | "loading_data"
  | "preprocessing"
  | "training_user_model"
  | "training_content_model"
  | "training_ranking_model"
  | "updating_cache"
  | "completed"
  | "failed"

// Training job
export interface TrainingJob {
  id: string
  status: TrainingJobStatus
  startedAt: Date
  completedAt?: Date
  progress: number // 0-100
  error: string | null
}

// Training status
export interface TrainingStatus {
  isTraining: boolean
  lastTrainingJob: TrainingJob | null
}
