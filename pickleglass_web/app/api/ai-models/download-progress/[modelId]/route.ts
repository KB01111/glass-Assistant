import { NextRequest, NextResponse } from 'next/server'

// Import the activeDownloads from the download route
// Note: In a real application, this would be stored in a database or Redis
const activeDownloads = new Map<string, {
  modelId: string
  progress: number
  status: 'downloading' | 'completed' | 'error'
  error?: string
}>()

export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const modelId = decodeURIComponent(params.modelId)
    
    const downloadInfo = activeDownloads.get(modelId)
    
    if (!downloadInfo) {
      return NextResponse.json(
        { error: 'Download not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      modelId: downloadInfo.modelId,
      percentage: downloadInfo.progress,
      status: downloadInfo.status,
      completed: downloadInfo.status === 'completed',
      error: downloadInfo.error
    })
    
  } catch (error) {
    console.error('Error getting download progress:', error)
    return NextResponse.json(
      { error: 'Failed to get download progress' },
      { status: 500 }
    )
  }
}
