import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const MODELS_CONFIG_FILE = path.join(os.homedir(), '.glass-assistant', 'models-config.json')

export async function POST(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const modelId = decodeURIComponent(params.modelId)
    
    // Read models config
    const config = await readModelsConfig()
    
    if (!config.models[modelId]) {
      return NextResponse.json(
        { error: 'Model not found' },
        { status: 404 }
      )
    }
    
    // Deactivate all other models
    Object.keys(config.models).forEach(id => {
      config.models[id].isActive = false
    })
    
    // Activate the selected model
    config.models[modelId].isActive = true
    config.models[modelId].lastUsed = new Date().toISOString()
    config.activeModel = modelId
    config.lastUpdated = new Date().toISOString()
    
    // Save updated config
    await fs.writeFile(MODELS_CONFIG_FILE, JSON.stringify(config, null, 2))
    
    // Notify the local AI service about the model change
    await notifyModelChange(modelId, config.models[modelId])
    
    return NextResponse.json({ 
      message: 'Model activated successfully',
      modelId,
      activeModel: config.activeModel
    })
    
  } catch (error) {
    console.error('Error activating model:', error)
    return NextResponse.json(
      { error: 'Failed to activate model' },
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

async function notifyModelChange(modelId: string, modelConfig: any) {
  try {
    // This would typically notify the local AI service about the model change
    // For now, we'll just log it
    console.log(`Model activated: ${modelId}`, {
      path: modelConfig.path,
      name: modelConfig.name
    })
    
    // In a real implementation, this might:
    // 1. Send IPC message to the main Electron process
    // 2. Update a shared configuration file
    // 3. Restart the local AI inference service
    // 4. Load the new model into memory
    
  } catch (error) {
    console.error('Error notifying model change:', error)
  }
}
