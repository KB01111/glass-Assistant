import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

const MODELS_DIR = path.join(os.homedir(), '.glass-assistant', 'models')

export async function GET() {
  try {
    // Calculate storage usage
    const storageInfo = await calculateStorageUsage()
    
    return NextResponse.json(storageInfo)
    
  } catch (error) {
    console.error('Error getting storage info:', error)
    return NextResponse.json(
      { error: 'Failed to get storage info' },
      { status: 500 }
    )
  }
}

async function calculateStorageUsage() {
  try {
    // Ensure models directory exists
    await fs.mkdir(MODELS_DIR, { recursive: true })
    
    const files = await fs.readdir(MODELS_DIR)
    let totalSize = 0
    
    for (const file of files) {
      const filePath = path.join(MODELS_DIR, file)
      const stats = await fs.stat(filePath)
      
      if (stats.isFile()) {
        totalSize += stats.size
      }
    }
    
    // Convert to GB
    const usedGB = totalSize / (1024 * 1024 * 1024)
    const limitGB = 50 // Default limit of 50GB
    
    return {
      used: `${usedGB.toFixed(1)} GB`,
      limit: `${limitGB} GB`,
      usedBytes: totalSize,
      limitBytes: limitGB * 1024 * 1024 * 1024,
      percentage: Math.round((usedGB / limitGB) * 100)
    }
    
  } catch (error) {
    return {
      used: '0 GB',
      limit: '50 GB',
      usedBytes: 0,
      limitBytes: 50 * 1024 * 1024 * 1024,
      percentage: 0
    }
  }
}
