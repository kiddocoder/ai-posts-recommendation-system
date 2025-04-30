// User interaction
export interface UserInteraction {
  id: string
  userId: string
  contentId: string
  action: string // 'view', 'like', 'comment', 'save', 'share'
  timestamp: Date
  categoryId: string
}

// Content features
export interface ContentFeatures {
  contentId: string
  title: string
  categoryId: string
  categoryName: string
  categoryVector: number[] // One-hot encoded category
  isMostPopular: boolean
  isRecommended: boolean
  isBettingTip: boolean
  viewCount: number
  likeCount: number
  commentCount: number
  saveCount: number
  shareCount: number
  daysOld: number
}
