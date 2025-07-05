import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const MODELS_DIR = path.join(os.homedir(), '.glass-assistant', 'models')
const MODELS_CONFIG_FILE = path.join(os.homedir(), '.glass-assistant', 'models-config.json')

export async function DELETE(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const modelId = decodeURIComponent(params.modelId)
    
    // Read models config to get file path
    const config = await readModelsConfig()
    const modelConfig = config.models[modelId]
    
    if (!modelConfig) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }
    
    // Delete the model file
    if (modelConfig.path && await fileExists(modelConfig.path)) {
      await fs.unlink(modelConfig.path)
    }
    
    // Remove from config
    delete config.models[modelId]
    
    // If this was the active model, clear it
    if (config.activeModel === modelId) {
      config.activeModel = null
    }
    
    config.lastUpdated = new Date().toISOString()
    
    // Save updated config
    await fs.writeFile(MODELS_CONFIG_FILE, JSON.stringify(config, null, 2))
    
    return NextResponse.json({ 
      message: 'Model deleted successfully',
      modelId 
    })
    
  } catch (error) {
    console.error('Error deleting model:', error)
    return NextResponse.json(
      { error: 'Failed to delete model' },
      { status: 500 }
    )
  }
}

async function readModelsConfig() {
  try {
    const configData = await fs.readFile(MODELS_CONFIG_FILE, 'utf-8')
    return JSON.parse(configData)
  } catch {
    return {
      models: {},
      activeModel: null,
      lastUpdated: new Date().toISOString()
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
