import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

interface InstalledModel {
  id: string
  name: string
  path: string
  size: string
  installedAt: string
  lastUsed?: string
  isActive: boolean
}

const MODELS_DIR = path.join(os.homedir(), '.glass-assistant', 'models')
const MODELS_CONFIG_FILE = path.join(os.homedir(), '.glass-assistant', 'models-config.json')

export async function GET() {
  try {
    // Ensure models directory exists
    await ensureModelsDirectory()
    
    // Read models configuration
    const modelsConfig = await readModelsConfig()
    
    // Get actual model files from filesystem
    const modelFiles = await getModelFiles()
    
    // Combine config with filesystem data
    const installedModels: InstalledModel[] = []
    
    for (const modelFile of modelFiles) {
      const modelId = path.basename(modelFile, path.extname(modelFile))
      const config = modelsConfig.models[modelId] || {}
      
      const stats = await fs.stat(modelFile)
      const sizeInBytes = stats.size
      const sizeFormatted = formatFileSize(sizeInBytes)
      
      installedModels.push({
        id: modelId,
        name: config.name || modelId,
        path: modelFile,
        size: sizeFormatted,
        installedAt: config.installedAt || stats.birthtime.toISOString(),
        lastUsed: config.lastUsed,
        isActive: config.isActive || false
      })
    }
    
    return NextResponse.json(installedModels)
    
  } catch (error) {
    console.error('Error getting installed models:', error)
    return NextResponse.json(
      { error: 'Failed to get installed models' },
      { status: 500 }
    )
  }
}

async function ensureModelsDirectory() {
  try {
    await fs.access(MODELS_DIR)
  } catch {
    await fs.mkdir(MODELS_DIR, { recursive: true })
  }
}

async function readModelsConfig() {
  try {
    const configData = await fs.readFile(MODELS_CONFIG_FILE, 'utf-8')
    return JSON.parse(configData)
  } catch {
    // Return default config if file doesn't exist
    return {
      models: {},
      activeModel: null,
      lastUpdated: new Date().toISOString()
    }
  }
}

async function getModelFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(MODELS_DIR)
    const modelFiles = []
    
    for (const file of files) {
      const filePath = path.join(MODELS_DIR, file)
      const stats = await fs.stat(filePath)
      
      if (stats.isFile() && (
        file.endsWith('.bin') || 
        file.endsWith('.safetensors') || 
        file.endsWith('.gguf') ||
        file.endsWith('.onnx')
      )) {
        modelFiles.push(filePath)
      }
    }
    
    return modelFiles
  } catch {
    return []
  }
}

function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 Bytes'
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  
  return `${size.toFixed(1)} ${sizes[i]}`
}
