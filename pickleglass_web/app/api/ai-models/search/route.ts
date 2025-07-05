import { NextRequest, NextResponse } from 'next/server'

interface HuggingFaceModel {
  id: string
  name: string
  author: string
  description: string
  downloads: number
  likes: number
  tags: string[]
  size: string
  lastModified: string
  modelType: 'text-generation' | 'text-to-image' | 'audio' | 'multimodal'
  isInstalled?: boolean
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const filter = searchParams.get('filter') || 'all'
    
    // Build Hugging Face API URL
    const baseUrl = 'https://huggingface.co/api/models'
    const params = new URLSearchParams({
      search: query,
      limit: '20',
      sort: 'downloads',
      direction: '-1'
    })
    
    // Add filter if not 'all'
    if (filter !== 'all') {
      params.append('filter', filter)
    }
    
    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        'User-Agent': 'Glass-Assistant/1.0'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Hugging Face API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Transform the data to our format
    const models: HuggingFaceModel[] = data.map((model: any) => ({
      id: model.id,
      name: model.id.split('/').pop() || model.id,
      author: model.id.split('/')[0] || 'Unknown',
      description: model.description || 'No description available',
      downloads: model.downloads || 0,
      likes: model.likes || 0,
      tags: model.tags || [],
      size: estimateModelSize(model.tags),
      lastModified: model.lastModified || new Date().toISOString(),
      modelType: determineModelType(model.tags),
      isInstalled: false // We'll check this against local storage
    }))
    
    // Check which models are already installed
    const installedModels = await getInstalledModels()
    const installedIds = new Set(installedModels.map(m => m.id))
    
    models.forEach(model => {
      model.isInstalled = installedIds.has(model.id)
    })
    
    return NextResponse.json(models)
    
  } catch (error) {
    console.error('Error searching models:', error)
    return NextResponse.json(
      { error: 'Failed to search models' },
      { status: 500 }
    )
  }
}

function estimateModelSize(tags: string[]): string {
  // Estimate model size based on tags and model type
  const sizeIndicators = {
    'tiny': '< 1 GB',
    'small': '1-3 GB',
    'base': '3-7 GB',
    'large': '7-15 GB',
    'xl': '15-30 GB',
    'xxl': '> 30 GB'
  }
  
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase()
    for (const [indicator, size] of Object.entries(sizeIndicators)) {
      if (lowerTag.includes(indicator)) {
        return size
      }
    }
  }
  
  // Default estimation based on model type
  if (tags.some(tag => tag.includes('text-generation'))) {
    return '3-7 GB'
  } else if (tags.some(tag => tag.includes('text-to-image'))) {
    return '5-10 GB'
  } else if (tags.some(tag => tag.includes('audio'))) {
    return '1-3 GB'
  }
  
  return '2-5 GB'
}

function determineModelType(tags: string[]): 'text-generation' | 'text-to-image' | 'audio' | 'multimodal' {
  const tagString = tags.join(' ').toLowerCase()
  
  if (tagString.includes('text-to-image') || tagString.includes('image-generation')) {
    return 'text-to-image'
  } else if (tagString.includes('audio') || tagString.includes('speech')) {
    return 'audio'
  } else if (tagString.includes('multimodal') || tagString.includes('vision')) {
    return 'multimodal'
  } else {
    return 'text-generation'
  }
}

async function getInstalledModels() {
  // This would typically read from a database or file system
  // For now, return empty array - will be implemented with the model management service
  return []
}
