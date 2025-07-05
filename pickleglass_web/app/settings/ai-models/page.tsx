'use client'

import { useState, useEffect } from 'react'
import { Download, Trash2, Play, Pause, HardDrive, Cpu, Search, Filter, Star, ExternalLink } from 'lucide-react'
import { useRedirectIfNotAuth } from '@/utils/auth'

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
  downloadProgress?: number
  isDownloading?: boolean
}

interface InstalledModel {
  id: string
  name: string
  path: string
  size: string
  installedAt: string
  lastUsed?: string
  isActive: boolean
}

export default function AIModelsPage() {
  const userInfo = useRedirectIfNotAuth()
  const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState<string>('all')
  const [huggingFaceModels, setHuggingFaceModels] = useState<HuggingFaceModel[]>([])
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [storageUsed, setStorageUsed] = useState('0 GB')
  const [storageLimit, setStorageLimit] = useState('50 GB')
  const [hardwareInfo, setHardwareInfo] = useState<any>(null)
  const [hardwareLoading, setHardwareLoading] = useState(true)

  useEffect(() => {
    // Load installed models on component mount
    loadInstalledModels()
    loadStorageInfo()
    loadHardwareInfo()
  }, [])

  const loadInstalledModels = async () => {
    try {
      // This would call the backend API to get installed models
      const response = await fetch('/api/ai-models/installed')
      const models = await response.json()
      setInstalledModels(models)
    } catch (error) {
      console.error('Failed to load installed models:', error)
    }
  }

  const loadStorageInfo = async () => {
    try {
      const response = await fetch('/api/ai-models/storage')
      const storage = await response.json()
      setStorageUsed(storage.used)
      setStorageLimit(storage.limit)
    } catch (error) {
      console.error('Failed to load storage info:', error)
    }
  }

  const loadHardwareInfo = async () => {
    try {
      setHardwareLoading(true)
      const response = await fetch('/api/ai-models/hardware')
      const hardware = await response.json()
      setHardwareInfo(hardware)
    } catch (error) {
      console.error('Failed to load hardware info:', error)
    } finally {
      setHardwareLoading(false)
    }
  }

  const searchHuggingFaceModels = async (query: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/ai-models/search?q=${encodeURIComponent(query)}&filter=${selectedFilter}`)
      const models = await response.json()
      setHuggingFaceModels(models)
    } catch (error) {
      console.error('Failed to search models:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const downloadModel = async (modelId: string) => {
    try {
      const response = await fetch('/api/ai-models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      })
      
      if (response.ok) {
        // Update model state to show downloading
        setHuggingFaceModels(prev => 
          prev.map(model => 
            model.id === modelId 
              ? { ...model, isDownloading: true, downloadProgress: 0 }
              : model
          )
        )
        
        // Start polling for download progress
        pollDownloadProgress(modelId)
      }
    } catch (error) {
      console.error('Failed to start download:', error)
    }
  }

  const pollDownloadProgress = (modelId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai-models/download-progress/${modelId}`)
        const progress = await response.json()
        
        setHuggingFaceModels(prev => 
          prev.map(model => 
            model.id === modelId 
              ? { ...model, downloadProgress: progress.percentage }
              : model
          )
        )
        
        if (progress.completed) {
          clearInterval(interval)
          setHuggingFaceModels(prev => 
            prev.map(model => 
              model.id === modelId 
                ? { ...model, isDownloading: false, isInstalled: true }
                : model
            )
          )
          loadInstalledModels() // Refresh installed models list
        }
      } catch (error) {
        console.error('Failed to get download progress:', error)
        clearInterval(interval)
      }
    }, 1000)
  }

  const deleteModel = async (modelId: string) => {
    try {
      const response = await fetch(`/api/ai-models/delete/${modelId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        setInstalledModels(prev => prev.filter(model => model.id !== modelId))
        loadStorageInfo() // Refresh storage info
      }
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  const activateModel = async (modelId: string) => {
    try {
      const response = await fetch(`/api/ai-models/activate/${modelId}`, {
        method: 'POST'
      })
      
      if (response.ok) {
        setInstalledModels(prev => 
          prev.map(model => ({
            ...model,
            isActive: model.id === modelId
          }))
        )
      }
    } catch (error) {
      console.error('Failed to activate model:', error)
    }
  }

  if (!userInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'profile', name: 'Personal profile', href: '/settings' },
    { id: 'privacy', name: 'Data & privacy', href: '/settings/privacy' },
    { id: 'ai-models', name: 'AI Models', href: '/settings/ai-models' },
    { id: 'billing', name: 'Billing', href: '/settings/billing' },
  ]

  const modelFilters = [
    { id: 'all', name: 'All Models' },
    { id: 'text-generation', name: 'Text Generation' },
    { id: 'text-to-image', name: 'Text to Image' },
    { id: 'audio', name: 'Audio' },
    { id: 'multimodal', name: 'Multimodal' },
  ]

  const renderBrowseTab = () => (
    <div className="space-y-6">
      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search Hugging Face models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && searchHuggingFaceModels(searchQuery)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={selectedFilter}
          onChange={(e) => setSelectedFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {modelFilters.map(filter => (
            <option key={filter.id} value={filter.id}>{filter.name}</option>
          ))}
        </select>
        <button
          onClick={() => searchHuggingFaceModels(searchQuery)}
          disabled={isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Model Results */}
      <div className="grid gap-4">
        {huggingFaceModels.map(model => (
          <div key={model.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                  <span className="text-sm text-gray-500">by {model.author}</span>
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-3">{model.description}</p>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    <Download className="w-4 h-4" />
                    {model.downloads.toLocaleString()} downloads
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    {model.likes.toLocaleString()} likes
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-4 h-4" />
                    {model.size}
                  </span>
                </div>
                <div className="flex gap-2">
                  {model.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="ml-4">
                {model.isInstalled ? (
                  <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg text-sm font-medium">
                    Installed
                  </span>
                ) : model.isDownloading ? (
                  <div className="text-center">
                    <div className="w-16 bg-gray-200 rounded-full h-2 mb-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${model.downloadProgress || 0}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-600">{model.downloadProgress || 0}%</span>
                  </div>
                ) : (
                  <button
                    onClick={() => downloadModel(model.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderInstalledTab = () => (
    <div className="space-y-6">
      {/* Hardware Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Hardware Information</h3>
        {hardwareLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
            <span className="ml-3 text-gray-600">Detecting hardware...</span>
          </div>
        ) : hardwareInfo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* CPU Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-5 h-5 text-blue-600" />
                <h4 className="font-medium text-gray-900">CPU</h4>
              </div>
              <p className="text-sm text-gray-600 mb-1">{hardwareInfo.cpu?.brand || 'Unknown'}</p>
              <p className="text-xs text-gray-500">{hardwareInfo.cpu?.cores || 0} cores @ {hardwareInfo.cpu?.speed || 0}GHz</p>
              <div className="mt-2">
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Score: {hardwareInfo.cpu?.aiPerformanceScore || 0}
                </span>
              </div>
            </div>

            {/* GPU Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-5 h-5 text-green-600" />
                <h4 className="font-medium text-gray-900">GPU</h4>
              </div>
              {hardwareInfo.gpu?.hasDedicatedGPU ? (
                <>
                  <p className="text-sm text-gray-600 mb-1">{hardwareInfo.gpu.bestGPU?.model || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{hardwareInfo.gpu.totalVRAM || 0}MB VRAM</p>
                  <div className="mt-2">
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Score: {hardwareInfo.gpu.bestGPU?.aiPerformanceScore || 0}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No dedicated GPU detected</p>
              )}
            </div>

            {/* NPU Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-5 h-5 text-purple-600" />
                <h4 className="font-medium text-gray-900">NPU</h4>
              </div>
              {hardwareInfo.npu?.detected ? (
                <>
                  <p className="text-sm text-gray-600 mb-1">Neural Processing Unit</p>
                  <div className="flex gap-1 mt-2">
                    {hardwareInfo.npu.capabilities.amdGaia && (
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">AMD Gaia</span>
                    )}
                    {hardwareInfo.npu.capabilities.intelGNA && (
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Intel GNA</span>
                    )}
                    {hardwareInfo.npu.capabilities.appleNeuralEngine && (
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Apple Neural</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No NPU detected</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Failed to detect hardware information</p>
        )}

        {/* Optimal Device Recommendation */}
        {hardwareInfo?.optimalDevice && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Recommended for AI Inference</h4>
            <p className="text-sm text-blue-800">
              <strong>{hardwareInfo.optimalDevice.type.toUpperCase()}</strong> - {hardwareInfo.optimalDevice.recommendation}
            </p>
          </div>
        )}
      </div>

      {/* Storage Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Storage Usage</h3>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Used: {storageUsed}</span>
          <span className="text-sm text-gray-600">Limit: {storageLimit}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full"
            style={{ width: `${(parseFloat(storageUsed) / parseFloat(storageLimit)) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Installed Models */}
      <div className="grid gap-4">
        {installedModels.map(model => (
          <div key={model.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                  {model.isActive && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded font-medium">
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-4 h-4" />
                    {model.size}
                  </span>
                  <span>Installed: {new Date(model.installedAt).toLocaleDateString()}</span>
                  {model.lastUsed && (
                    <span>Last used: {new Date(model.lastUsed).toLocaleDateString()}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{model.path}</p>
              </div>
              <div className="ml-4 flex gap-2">
                {!model.isActive && (
                  <button
                    onClick={() => activateModel(model.id)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => deleteModel(model.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="bg-stone-50 min-h-screen">
      <div className="px-8 py-8">
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-1">Settings</p>
          <h1 className="text-3xl font-bold text-gray-900">AI Models</h1>
        </div>
        
        <div className="mb-8">
          <nav className="flex space-x-10">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={tab.href}
                className={`pb-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                  tab.id === 'ai-models'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </a>
            ))}
          </nav>
        </div>

        {/* AI Models Tabs */}
        <div className="mb-6">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'browse'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Browse Models
            </button>
            <button
              onClick={() => setActiveTab('installed')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'installed'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Installed Models ({installedModels.length})
            </button>
          </div>
        </div>

        {activeTab === 'browse' ? renderBrowseTab() : renderInstalledTab()}
      </div>
    </div>
  )
}
