import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const MODELS_DIR = path.join(os.homedir(), '.glass-assistant', 'models')
const DOWNLOADS_DIR = path.join(os.homedir(), '.glass-assistant', 'downloads')
const MODELS_CONFIG_FILE = path.join(os.homedir(), '.glass-assistant', 'models-config.json')

// Store active downloads
const activeDownloads = new Map<string, {
  modelId: string
  progress: number
  status: 'downloading' | 'completed' | 'error'
  error?: string
}>()

export async function POST(request: NextRequest) {
  try {
    const { modelId } = await request.json()
    
    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID is required' },
        { status: 400 }
      )
    }
    
    // Check if already downloading
    if (activeDownloads.has(modelId)) {
      return NextResponse.json(
        { error: 'Model is already being downloaded' },
        { status: 409 }
      )
    }
    
    // Start download in background
    startModelDownload(modelId)
    
    return NextResponse.json({ 
      message: 'Download started',
      modelId 
    })
    
  } catch (error) {
    console.error('Error starting download:', error)
    return NextResponse.json(
      { error: 'Failed to start download' },
      { status: 500 }
    )
  }
}

async function startModelDownload(modelId: string) {
  try {
    // Initialize download tracking
    activeDownloads.set(modelId, {
      modelId,
      progress: 0,
      status: 'downloading'
    })
    
    // Ensure directories exist
    await ensureDirectories()
    
    // Get model info from Hugging Face
    const modelInfo = await getModelInfo(modelId)
    
    if (!modelInfo) {
      throw new Error('Model not found')
    }
    
    // Find the main model file to download
    const modelFile = findMainModelFile(modelInfo.siblings || [])
    
    if (!modelFile) {
      throw new Error('No suitable model file found')
    }
    
    // Download the model file
    const downloadUrl = `https://huggingface.co/${modelId}/resolve/main/${modelFile.rfilename}`
    const tempFilePath = path.join(DOWNLOADS_DIR, `${modelId.replace('/', '_')}_${modelFile.rfilename}`)
    const finalFilePath = path.join(MODELS_DIR, `${modelId.replace('/', '_')}_${modelFile.rfilename}`)
    
    await downloadFile(downloadUrl, tempFilePath, modelId)
    
    // Move to final location
    await fs.rename(tempFilePath, finalFilePath)
    
    // Update models config
    await updateModelsConfig(modelId, {
      name: modelId.split('/').pop() || modelId,
      path: finalFilePath,
      installedAt: new Date().toISOString(),
      isActive: false,
      source: 'huggingface',
      originalId: modelId
    })
    
    // Mark as completed
    activeDownloads.set(modelId, {
      modelId,
      progress: 100,
      status: 'completed'
    })
    
    console.log(`Model ${modelId} downloaded successfully`)
    
  } catch (error) {
    console.error(`Error downloading model ${modelId}:`, error)
    activeDownloads.set(modelId, {
      modelId,
      progress: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

async function getModelInfo(modelId: string) {
  try {
    const response = await fetch(`https://huggingface.co/api/models/${modelId}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`Error fetching model info for ${modelId}:`, error)
    return null
  }
}

function findMainModelFile(siblings: any[]): any {
  // Priority order for model files
  const priorities = [
    /\.safetensors$/,
    /\.bin$/,
    /\.gguf$/,
    /\.onnx$/,
    /pytorch_model\.bin$/,
    /model\.safetensors$/
  ]
  
  for (const pattern of priorities) {
    const file = siblings.find(s => pattern.test(s.rfilename))
    if (file) return file
  }
  
  // Fallback to largest file
  return siblings
    .filter(s => s.rfilename.includes('model') || s.rfilename.includes('pytorch'))
    .sort((a, b) => (b.size || 0) - (a.size || 0))[0]
}

async function downloadFile(url: string, filePath: string, modelId: string) {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  const totalSize = parseInt(response.headers.get('content-length') || '0')
  let downloadedSize = 0
  
  const fileStream = await fs.open(filePath, 'w')
  const reader = response.body?.getReader()
  
  if (!reader) {
    throw new Error('Failed to get response reader')
  }
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      await fileStream.write(value)
      downloadedSize += value.length
      
      // Update progress
      const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
      activeDownloads.set(modelId, {
        modelId,
        progress,
        status: 'downloading'
      })
    }
  } finally {
    await fileStream.close()
  }
}

async function ensureDirectories() {
  await fs.mkdir(MODELS_DIR, { recursive: true })
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true })
  await fs.mkdir(path.dirname(MODELS_CONFIG_FILE), { recursive: true })
}

async function updateModelsConfig(modelId: string, modelData: any) {
  let config
  try {
    const configData = await fs.readFile(MODELS_CONFIG_FILE, 'utf-8')
    config = JSON.parse(configData)
  } catch {
    config = { models: {}, activeModel: null, lastUpdated: new Date().toISOString() }
  }
  
  config.models[modelId] = modelData
  config.lastUpdated = new Date().toISOString()
  
  await fs.writeFile(MODELS_CONFIG_FILE, JSON.stringify(config, null, 2))
}

// Export the activeDownloads for the progress endpoint
export { activeDownloads }
