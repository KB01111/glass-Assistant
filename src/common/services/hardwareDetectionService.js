const { EventEmitter } = require('events');
const si = require('systeminformation');
const os = require('os');
const { execSync } = require('child_process');

class HardwareDetectionService extends EventEmitter {
    constructor() {
        super();
        this.hardwareInfo = {
            cpu: null,
            gpu: null,
            npu: null,
            memory: null,
            system: null,
            lastUpdated: null
        };
        this.isInitialized = false;
        this.detectionInProgress = false;
    }

    async initialize() {
        if (this.isInitialized) return this.hardwareInfo;

        try {
            console.log('[HardwareDetection] Starting hardware detection...');
            this.detectionInProgress = true;

            // Detect hardware components in order (CPU first, then NPU which depends on CPU info)
            await this.detectCPU();
            await this.detectMemory();
            await this.detectSystem();
            await this.detectGPU();
            await this.detectNPU(); // Must be after CPU detection

            this.hardwareInfo.lastUpdated = new Date().toISOString();
            this.isInitialized = true;
            this.detectionInProgress = false;

            console.log('[HardwareDetection] Hardware detection completed');
            this.emit('detectionComplete', this.hardwareInfo);

            return this.hardwareInfo;
        } catch (error) {
            console.error('[HardwareDetection] Hardware detection failed:', error);
            this.detectionInProgress = false;
            throw error;
        }
    }

    async detectCPU() {
        try {
            const [cpuInfo, cpuFlags, cpuTemp] = await Promise.all([
                si.cpu(),
                si.cpuFlags().catch(() => ''),
                si.cpuTemperature().catch(() => ({ main: -1, cores: [], max: -1 }))
            ]);

            this.hardwareInfo.cpu = {
                manufacturer: cpuInfo.manufacturer || 'Unknown',
                brand: cpuInfo.brand || 'Unknown',
                model: cpuInfo.model || 'Unknown',
                speed: cpuInfo.speed || 0,
                speedMin: cpuInfo.speedMin || 0,
                speedMax: cpuInfo.speedMax || 0,
                cores: cpuInfo.cores || 0,
                physicalCores: cpuInfo.physicalCores || 0,
                performanceCores: cpuInfo.performanceCores || 0,
                efficiencyCores: cpuInfo.efficiencyCores || 0,
                socket: cpuInfo.socket || 'Unknown',
                architecture: process.arch,
                flags: cpuFlags,
                virtualization: cpuInfo.virtualization || false,
                cache: cpuInfo.cache || {},
                temperature: cpuTemp,
                
                // AI-specific capabilities
                capabilities: {
                    avx: cpuFlags.includes('avx'),
                    avx2: cpuFlags.includes('avx2'),
                    avx512: cpuFlags.includes('avx512'),
                    fma: cpuFlags.includes('fma'),
                    sse: cpuFlags.includes('sse'),
                    sse2: cpuFlags.includes('sse2'),
                    sse3: cpuFlags.includes('sse3'),
                    sse4_1: cpuFlags.includes('sse4_1'),
                    sse4_2: cpuFlags.includes('sse4_2'),
                    aes: cpuFlags.includes('aes'),
                    sha: cpuFlags.includes('sha')
                },
                
                // Performance estimation for AI workloads
                aiPerformanceScore: this.calculateCPUAIScore(cpuInfo, cpuFlags)
            };

            console.log(`[HardwareDetection] CPU detected: ${this.hardwareInfo.cpu.brand}`);
        } catch (error) {
            console.error('[HardwareDetection] CPU detection failed:', error);
            this.hardwareInfo.cpu = { error: error.message };
        }
    }

    async detectGPU() {
        try {
            const graphicsInfo = await si.graphics();
            const gpus = graphicsInfo.controllers || [];

            this.hardwareInfo.gpu = {
                controllers: gpus.map(gpu => ({
                    vendor: gpu.vendor || 'Unknown',
                    model: gpu.model || 'Unknown',
                    vram: gpu.vram || 0,
                    vramDynamic: gpu.vramDynamic || false,
                    bus: gpu.bus || 'Unknown',
                    deviceId: gpu.deviceId,
                    vendorId: gpu.vendorId,
                    external: gpu.external || false,
                    cores: gpu.cores || 0,
                    
                    // AI-specific capabilities
                    capabilities: {
                        cuda: this.detectCUDA(gpu),
                        opencl: this.detectOpenCL(gpu),
                        vulkan: this.detectVulkan(gpu),
                        directml: this.detectDirectML(gpu),
                        metal: gpu.metalVersion ? true : false,
                        metalVersion: gpu.metalVersion
                    },
                    
                    // Performance estimation for AI workloads
                    aiPerformanceScore: this.calculateGPUAIScore(gpu),
                    
                    // Additional NVIDIA-specific info if available
                    nvidia: gpu.driverVersion ? {
                        driverVersion: gpu.driverVersion,
                        memoryTotal: gpu.memoryTotal,
                        memoryUsed: gpu.memoryUsed,
                        memoryFree: gpu.memoryFree,
                        utilizationGpu: gpu.utilizationGpu,
                        utilizationMemory: gpu.utilizationMemory,
                        temperatureGpu: gpu.temperatureGpu,
                        powerDraw: gpu.powerDraw,
                        powerLimit: gpu.powerLimit
                    } : null
                })),
                
                displays: graphicsInfo.displays || [],
                
                // Overall GPU capabilities
                hasDedicatedGPU: gpus.some(gpu => !gpu.vramDynamic && gpu.vram > 0),
                totalVRAM: gpus.reduce((total, gpu) => total + (gpu.vram || 0), 0),
                bestGPU: this.selectBestGPU(gpus)
            };

            console.log(`[HardwareDetection] GPU detected: ${gpus.length} controller(s)`);
        } catch (error) {
            console.error('[HardwareDetection] GPU detection failed:', error);
            this.hardwareInfo.gpu = { error: error.message };
        }
    }

    async detectNPU() {
        try {
            const npuInfo = {
                detected: false,
                devices: [],
                capabilities: {
                    intelGNA: false,
                    amdGaia: false,
                    appleNeuralEngine: false,
                    qualcommHexagon: false,
                    armEthos: false
                }
            };

            // Check for Intel GNA (Gaussian & Neural Accelerator)
            if (this.hardwareInfo.cpu?.manufacturer?.toLowerCase().includes('intel')) {
                npuInfo.capabilities.intelGNA = await this.detectIntelGNA();
            }

            // Check for AMD Gaia NPU
            if (this.hardwareInfo.cpu?.manufacturer?.toLowerCase().includes('amd')) {
                npuInfo.capabilities.amdGaia = await this.detectAMDGaia();
            }

            // Check for Apple Neural Engine
            if (process.platform === 'darwin' && process.arch === 'arm64') {
                npuInfo.capabilities.appleNeuralEngine = await this.detectAppleNeuralEngine();
            }

            // Check for Qualcomm Hexagon DSP
            npuInfo.capabilities.qualcommHexagon = await this.detectQualcommHexagon();

            // Check for ARM Ethos NPU
            if (process.arch.includes('arm')) {
                npuInfo.capabilities.armEthos = await this.detectARMEthos();
            }

            // Determine if any NPU is detected
            npuInfo.detected = Object.values(npuInfo.capabilities).some(Boolean);

            if (npuInfo.detected) {
                npuInfo.devices = await this.enumerateNPUDevices();
                npuInfo.aiPerformanceScore = this.calculateNPUAIScore(npuInfo);
            }

            this.hardwareInfo.npu = npuInfo;
            console.log(`[HardwareDetection] NPU detection: ${npuInfo.detected ? 'Found' : 'None detected'}`);
        } catch (error) {
            console.error('[HardwareDetection] NPU detection failed:', error);
            this.hardwareInfo.npu = { error: error.message, detected: false };
        }
    }

    async detectMemory() {
        try {
            const [memInfo, memLayout] = await Promise.all([
                si.mem(),
                si.memLayout().catch(() => [])
            ]);

            this.hardwareInfo.memory = {
                total: memInfo.total || 0,
                free: memInfo.free || 0,
                used: memInfo.used || 0,
                available: memInfo.available || 0,
                swapTotal: memInfo.swaptotal || 0,
                swapUsed: memInfo.swapused || 0,
                swapFree: memInfo.swapfree || 0,
                
                layout: memLayout.map(module => ({
                    size: module.size || 0,
                    bank: module.bank || 'Unknown',
                    type: module.type || 'Unknown',
                    clockSpeed: module.clockSpeed || 0,
                    formFactor: module.formFactor || 'Unknown',
                    manufacturer: module.manufacturer || 'Unknown'
                })),
                
                // AI workload considerations
                totalGB: Math.round((memInfo.total || 0) / (1024 * 1024 * 1024)),
                availableForAI: Math.round((memInfo.available || 0) / (1024 * 1024 * 1024)),
                recommendedModelSize: this.calculateRecommendedModelSize(memInfo.total || 0)
            };

            console.log(`[HardwareDetection] Memory detected: ${this.hardwareInfo.memory.totalGB}GB total`);
        } catch (error) {
            console.error('[HardwareDetection] Memory detection failed:', error);
            this.hardwareInfo.memory = { error: error.message };
        }
    }

    async detectSystem() {
        try {
            const [systemInfo, osInfo] = await Promise.all([
                si.system(),
                si.osInfo()
            ]);

            this.hardwareInfo.system = {
                manufacturer: systemInfo.manufacturer || 'Unknown',
                model: systemInfo.model || 'Unknown',
                version: systemInfo.version || 'Unknown',
                serial: systemInfo.serial || 'Unknown',
                uuid: systemInfo.uuid || 'Unknown',
                virtual: systemInfo.virtual || false,
                virtualHost: systemInfo.virtualHost,
                
                os: {
                    platform: osInfo.platform || process.platform,
                    distro: osInfo.distro || 'Unknown',
                    release: osInfo.release || 'Unknown',
                    arch: osInfo.arch || process.arch,
                    kernel: osInfo.kernel || 'Unknown',
                    hostname: osInfo.hostname || os.hostname()
                }
            };

            console.log(`[HardwareDetection] System detected: ${this.hardwareInfo.system.manufacturer} ${this.hardwareInfo.system.model}`);
        } catch (error) {
            console.error('[HardwareDetection] System detection failed:', error);
            this.hardwareInfo.system = { error: error.message };
        }
    }

    // NPU Detection Methods
    async detectIntelGNA() {
        try {
            // Check for Intel GNA in device manager or system info
            if (process.platform === 'win32') {
                try {
                    // Try PowerShell as alternative to wmic
                    const devices = execSync('powershell "Get-WmiObject -Class Win32_PnPEntity | Select-Object Name | Out-String"', { encoding: 'utf8' });
                    return devices.toLowerCase().includes('gna') ||
                           devices.toLowerCase().includes('neural') ||
                           devices.toLowerCase().includes('intel neural');
                } catch {
                    // Fallback: check CPU brand for known Intel processors with GNA
                    const cpuBrand = this.hardwareInfo.cpu?.brand?.toLowerCase() || '';
                    return cpuBrand.includes('core i') && (cpuBrand.includes('11th') || cpuBrand.includes('12th') || cpuBrand.includes('13th'));
                }
            } else if (process.platform === 'linux') {
                try {
                    const lspci = execSync('lspci', { encoding: 'utf8' });
                    return lspci.toLowerCase().includes('gna') || lspci.toLowerCase().includes('neural');
                } catch {
                    return false;
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    async detectAMDGaia() {
        try {
            // Check CPU brand first for Ryzen AI processors
            const cpuBrand = this.hardwareInfo.cpu?.brand?.toLowerCase() || '';
            if (cpuBrand.includes('ryzen ai') || cpuBrand.includes('ryzen 9 hx 370')) {
                console.log('[HardwareDetection] AMD Ryzen AI processor detected - NPU likely present');
                return true;
            }

            // Check for AMD Gaia NPU via device enumeration
            if (process.platform === 'win32') {
                try {
                    // Try PowerShell as alternative to wmic
                    const devices = execSync('powershell "Get-WmiObject -Class Win32_PnPEntity | Select-Object Name | Out-String"', { encoding: 'utf8' });
                    return devices.toLowerCase().includes('gaia') ||
                           devices.toLowerCase().includes('amd neural') ||
                           devices.toLowerCase().includes('ryzen ai') ||
                           devices.toLowerCase().includes('npu');
                } catch {
                    // Fallback: check if it's a known Ryzen AI processor
                    return cpuBrand.includes('ryzen ai');
                }
            } else if (process.platform === 'linux') {
                try {
                    const lspci = execSync('lspci', { encoding: 'utf8' });
                    return lspci.toLowerCase().includes('gaia') ||
                           lspci.toLowerCase().includes('amd neural') ||
                           lspci.toLowerCase().includes('ryzen ai');
                } catch {
                    return cpuBrand.includes('ryzen ai');
                }
            }
            return cpuBrand.includes('ryzen ai');
        } catch {
            // Final fallback: check CPU brand
            const cpuBrand = this.hardwareInfo.cpu?.brand?.toLowerCase() || '';
            return cpuBrand.includes('ryzen ai');
        }
    }

    async detectAppleNeuralEngine() {
        try {
            if (process.platform === 'darwin') {
                try {
                    const systemProfiler = execSync('system_profiler SPHardwareDataType', { encoding: 'utf8' });
                    return systemProfiler.includes('Neural Engine') || 
                           systemProfiler.includes('Apple M1') || 
                           systemProfiler.includes('Apple M2') ||
                           systemProfiler.includes('Apple M3');
                } catch {
                    return false;
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    async detectQualcommHexagon() {
        try {
            // Check for Qualcomm Hexagon DSP
            if (process.platform === 'win32') {
                try {
                    // Try PowerShell as alternative to wmic
                    const devices = execSync('powershell "Get-WmiObject -Class Win32_PnPEntity | Select-Object Name | Out-String"', { encoding: 'utf8' });
                    return devices.toLowerCase().includes('hexagon') ||
                           (devices.toLowerCase().includes('qualcomm') && devices.toLowerCase().includes('dsp'));
                } catch {
                    return false;
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    async detectARMEthos() {
        try {
            // Check for ARM Ethos NPU
            if (process.platform === 'linux' && process.arch.includes('arm')) {
                try {
                    const cpuinfo = execSync('cat /proc/cpuinfo', { encoding: 'utf8' });
                    return cpuinfo.toLowerCase().includes('ethos') || 
                           cpuinfo.toLowerCase().includes('arm neural');
                } catch {
                    return false;
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    // GPU Capability Detection
    detectCUDA(gpu) {
        return gpu.vendor?.toLowerCase().includes('nvidia') && gpu.model?.toLowerCase().includes('geforce') ||
               gpu.model?.toLowerCase().includes('quadro') || gpu.model?.toLowerCase().includes('tesla');
    }

    detectOpenCL(gpu) {
        // Most modern GPUs support OpenCL
        return gpu.vendor && !gpu.vramDynamic;
    }

    detectVulkan(gpu) {
        // Most modern GPUs support Vulkan
        return gpu.vendor && !gpu.vramDynamic;
    }

    detectDirectML(gpu) {
        // DirectML is available on Windows with modern GPUs
        return process.platform === 'win32' && gpu.vendor;
    }

    // Performance Scoring
    calculateCPUAIScore(cpuInfo, flags) {
        let score = 0;
        
        // Base score from cores and speed
        score += (cpuInfo.cores || 0) * 10;
        score += (cpuInfo.speed || 0) * 5;
        
        // Bonus for AI-relevant instruction sets
        if (flags.includes('avx512')) score += 50;
        else if (flags.includes('avx2')) score += 30;
        else if (flags.includes('avx')) score += 20;
        
        if (flags.includes('fma')) score += 15;
        if (flags.includes('aes')) score += 10;
        
        // Bonus for high-end CPUs
        const brand = (cpuInfo.brand || '').toLowerCase();
        if (brand.includes('i9') || brand.includes('ryzen 9')) score += 40;
        else if (brand.includes('i7') || brand.includes('ryzen 7')) score += 30;
        else if (brand.includes('i5') || brand.includes('ryzen 5')) score += 20;
        
        return Math.min(score, 1000); // Cap at 1000
    }

    calculateGPUAIScore(gpu) {
        let score = 0;

        // Base score from VRAM (more VRAM = better for AI)
        score += (gpu.vram || 0) / 10; // 1 point per 10MB VRAM

        // Vendor-specific bonuses
        const vendor = (gpu.vendor || '').toLowerCase();
        const model = (gpu.model || '').toLowerCase();

        if (vendor.includes('nvidia')) {
            score += 200; // NVIDIA generally better for AI due to CUDA
            if (model.includes('rtx')) score += 100;
            if (model.includes('4090')) score += 300;
            else if (model.includes('4080')) score += 250;
            else if (model.includes('4070')) score += 200;
            else if (model.includes('4060')) score += 150;
            else if (model.includes('3090')) score += 280;
            else if (model.includes('3080')) score += 230;
            else if (model.includes('3070')) score += 180;

            // Laptop GPU penalty (slightly lower performance)
            if (model.includes('laptop')) score -= 50;
        } else if (vendor.includes('amd') || vendor.includes('advanced micro devices')) {
            score += 100; // AMD decent for AI with ROCm
            if (model.includes('rx 7900')) score += 180;
            else if (model.includes('rx 7800')) score += 150;
            else if (model.includes('rx 6900')) score += 160;
            else if (model.includes('890m')) score += 80; // Integrated graphics
            else if (model.includes('radeon')) score += 50;
        } else if (vendor.includes('intel')) {
            score += 60;
            if (model.includes('arc')) score += 100;
        }

        // Dedicated GPU bonus
        if (!gpu.vramDynamic && gpu.vram > 2048) {
            score += 100;
        }

        return Math.min(score, 1000); // Cap at 1000
    }

    calculateNPUAIScore(npuInfo) {
        let score = 0;
        
        if (npuInfo.capabilities.appleNeuralEngine) score += 300;
        if (npuInfo.capabilities.amdGaia) score += 250;
        if (npuInfo.capabilities.intelGNA) score += 200;
        if (npuInfo.capabilities.qualcommHexagon) score += 150;
        if (npuInfo.capabilities.armEthos) score += 180;
        
        return score;
    }

    calculateRecommendedModelSize(totalMemory) {
        const totalGB = totalMemory / (1024 * 1024 * 1024);
        
        if (totalGB >= 32) return 'Large (7B+ parameters)';
        else if (totalGB >= 16) return 'Medium (3-7B parameters)';
        else if (totalGB >= 8) return 'Small (1-3B parameters)';
        else return 'Tiny (<1B parameters)';
    }

    selectBestGPU(gpus) {
        if (!gpus || gpus.length === 0) return null;
        
        return gpus.reduce((best, current) => {
            const currentScore = this.calculateGPUAIScore(current);
            const bestScore = this.calculateGPUAIScore(best);
            return currentScore > bestScore ? current : best;
        });
    }

    async enumerateNPUDevices() {
        // This would enumerate actual NPU devices
        // For now, return placeholder based on detected capabilities
        const devices = [];
        
        if (this.hardwareInfo.npu?.capabilities.amdGaia) {
            devices.push({
                name: 'AMD Gaia NPU',
                type: 'NPU',
                vendor: 'AMD',
                capabilities: ['inference', 'training'],
                performance: 'High'
            });
        }
        
        if (this.hardwareInfo.npu?.capabilities.intelGNA) {
            devices.push({
                name: 'Intel GNA',
                type: 'NPU',
                vendor: 'Intel',
                capabilities: ['inference'],
                performance: 'Medium'
            });
        }
        
        if (this.hardwareInfo.npu?.capabilities.appleNeuralEngine) {
            devices.push({
                name: 'Apple Neural Engine',
                type: 'NPU',
                vendor: 'Apple',
                capabilities: ['inference', 'training'],
                performance: 'High'
            });
        }
        
        return devices;
    }

    // Public API Methods
    getHardwareInfo() {
        return this.hardwareInfo;
    }

    getCPUInfo() {
        return this.hardwareInfo.cpu;
    }

    getGPUInfo() {
        return this.hardwareInfo.gpu;
    }

    getNPUInfo() {
        return this.hardwareInfo.npu;
    }

    getMemoryInfo() {
        return this.hardwareInfo.memory;
    }

    getSystemInfo() {
        return this.hardwareInfo.system;
    }

    async selectOptimalDevice() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const devices = [];

        // Add NPU if available
        if (this.hardwareInfo.npu?.detected) {
            devices.push({
                type: 'NPU',
                score: this.hardwareInfo.npu.aiPerformanceScore || 0,
                info: this.hardwareInfo.npu
            });
        }

        // Add best GPU if available
        if (this.hardwareInfo.gpu?.bestGPU) {
            devices.push({
                type: 'GPU',
                score: this.calculateGPUAIScore(this.hardwareInfo.gpu.bestGPU),
                info: this.hardwareInfo.gpu.bestGPU
            });
        }

        // Add CPU
        if (this.hardwareInfo.cpu) {
            devices.push({
                type: 'CPU',
                score: this.hardwareInfo.cpu.aiPerformanceScore || 0,
                info: this.hardwareInfo.cpu
            });
        }

        // Sort by performance score and return the best
        devices.sort((a, b) => b.score - a.score);
        
        return devices.length > 0 ? devices[0] : { type: 'CPU', score: 0, info: null };
    }

    async refresh() {
        this.isInitialized = false;
        return await this.initialize();
    }
}

module.exports = HardwareDetectionService;
