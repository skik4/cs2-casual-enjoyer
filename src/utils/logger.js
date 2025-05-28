import { LOG_LEVELS, LOG_LEVEL_PRIORITY, LOGGING_CONFIG } from '../shared/constants.js';

/**
 * Electron-based logging system with level control
 * Uses Electron's built-in logging capabilities
 */
class Logger {
    constructor() {
        this.isElectronAvailable = typeof window !== 'undefined' && window.electronAPI?.log;
        this.currentLevel = LOGGING_CONFIG?.CURRENT_LEVEL || 'info';
        this.logBuffer = [];
        
        // Expose logger to global scope for console access
        if (typeof window !== 'undefined') {
            window.logger = this;
            
            // Add global shortcuts for easy console access
            window.debug = () => {
                this.setLevel('debug');
                console.log('🔧 Debug mode enabled');
                return 'debug';
            };
            
            window.trace = () => {
                this.setLevel('trace');
                console.log('🔍 Trace mode enabled (maximum detail)');
                return 'trace';
            };
            
            window.info = () => {
                this.setLevel('info');
                console.log('ℹ️ Info mode enabled (production)');
                return 'info';
            };
            
            window.error = () => {
                this.setLevel('error');
                console.log('❌ Error mode enabled (minimal)');
                return 'error';
            };
            
            window.logs = (count = 50, level = null) => {
                if (level) {
                    const filteredLogs = this.getRecentLogs(count, level);
                    console.log(`📋 Last ${count} ${level.toUpperCase()} logs:`);
                    return filteredLogs;
                } else {
                    console.log(`📋 Last ${count} logs:`);
                    return this.getRecentLogs(count);
                }
            };
            
            window.clearLogs = () => {
                this.clearLogs();
                console.log('🗑️ Logs cleared');
                return 'cleared';
            };
            
            window.logLevel = () => {
                console.log(`📊 Current log level: ${this.getLevel()}`);
                return this.getLevel();
            };
            
            // Add specific level shortcuts for logs
            window.errorLogs = (count = 50) => {
                const logs = this.getLogsByLevel('error', count);
                console.log(`❌ Last ${count} ERROR logs:`);
                return logs;
            };
            
            window.infoLogs = (count = 50) => {
                const logs = this.getLogsByLevel('info', count);
                console.log(`ℹ️ Last ${count} INFO logs:`);
                return logs;
            };
            
            window.debugLogs = (count = 50) => {
                const logs = this.getLogsByLevel('debug', count);
                console.log(`🔧 Last ${count} DEBUG logs:`);
                return logs;
            };
            
            window.traceLogs = (count = 50) => {
                const logs = this.getLogsByLevel('trace', count);
                console.log(`🔍 Last ${count} TRACE logs:`);
                return logs;
            };
            
            window.logHelp = () => {
                console.log(`
🚀 Logger shortcuts:
• debug()         - Enable debug mode
• trace()         - Enable trace mode (max detail)
• info()          - Enable info mode (production)
• error()         - Enable error mode (minimal)

• logs(50)        - Show last 50 logs (all levels)
• logs(50, 'info') - Show last 50 INFO logs
• logs(50, 'debug') - Show last 50 DEBUG logs

• errorLogs(50)   - Show last 50 ERROR logs
• infoLogs(50)    - Show last 50 INFO logs  
• debugLogs(50)   - Show last 50 DEBUG logs
• traceLogs(50)   - Show last 50 TRACE logs

• clearLogs()     - Clear log buffer
• logLevel()      - Show current level
• logHelp()       - Show this help

Full API:
• logger.setLevel('debug')
• logger.getRecentLogs(100, 'info')
• logger.getLogsByLevel('debug', 50)
• logger.getAvailableLevels()
                `);
                return 'help shown';
            };
        }
    }

    /**
     * Check if a message at given level should be logged
     * @param {string} level - Log level to check
     * @returns {boolean} Whether message should be logged
     */
    shouldLog(level) {
        // Fallback for test environment
        const defaultPriorities = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };
        
        const priorities = typeof LOG_LEVEL_PRIORITY !== 'undefined' ? LOG_LEVEL_PRIORITY : defaultPriorities;
        const currentPriority = priorities[this.currentLevel] || 0;
        const messagePriority = priorities[level] || 0;
        return messagePriority <= currentPriority;
    }

    /**
     * Set logging level
     * @param {string} level - New logging level
     */
    setLevel(level) {
        if (LOG_LEVEL_PRIORITY.hasOwnProperty(level)) {
            this.currentLevel = level;
            if (LOGGING_CONFIG) {
                LOGGING_CONFIG.CURRENT_LEVEL = level;
                
                // Update feature flags based on level
                const isDebugOrTrace = level === 'debug' || level === 'trace';
                LOGGING_CONFIG.ENABLE_API_RESPONSE_LOGGING = isDebugOrTrace;
                LOGGING_CONFIG.ENABLE_FRIEND_FILTERING_LOGGING = isDebugOrTrace;
                LOGGING_CONFIG.ENABLE_STATE_CHANGE_LOGGING = isDebugOrTrace;
            }
            
            this.info('Logger', `Log level changed to: ${level}`);
            return true;
        }
        return false;
    }

    /**
     * Get current logging level
     * @returns {string} - Current logging level
     */
    getLevel() {
        return this.currentLevel;
    }

    /**
     * Format log message with context
     * @param {string} level - Log level
     * @param {string} context - Context/module name
     * @param {string} message - Log message
     * @param {any} [data] - Additional data
     * @returns {string} - Formatted message
     */
    formatMessage(level, context, message, data) {
        const baseMessage = `[${context}] ${message}`;
        
        if (data && typeof data === 'object') {
            return `${baseMessage} | Data: ${JSON.stringify(data)}`;
        } else if (data) {
            return `${baseMessage} | ${data}`;
        }
        
        return baseMessage;
    }

    /**
     * Add log to buffer (for debugging)
     * @param {string} level - Log level
     * @param {string} context - Context/module name
     * @param {string} message - Log message
     * @param {any} [data] - Additional data
     */
    addToBuffer(level, context, message, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            context,
            message,
            data
        };
        
        this.logBuffer.push(entry);
        
        // Keep buffer size limited
        const maxEntries = LOGGING_CONFIG?.MAX_LOG_ENTRIES || 1000;
        if (this.logBuffer.length > maxEntries) {
            this.logBuffer = this.logBuffer.slice(-maxEntries);
        }
    }

    /**
     * Get color for log level text
     * @param {string} level - Log level
     * @returns {string} - CSS color value
     */
    getLevelColor(level) {
        const colors = {
            error: '#ff4444',
            warn: '#ffaa00',
            info: '#4488ff',
            debug: '#228844',
            trace: '#aa88ff'
        };
        return colors[level] || '#ffffff';
    }

    /**
     * Send log to Electron main process
     * @param {string} level - Log level
     * @param {string} context - Context/module name
     * @param {string} message - Log message
     * @param {any} [data] - Additional data
     */
    sendToElectron(level, context, message, data) {
        if (!this.shouldLog(level)) {
            return;
        }

        this.addToBuffer(level, context, message, data);

        // Send to Electron main process
        if (this.isElectronAvailable) {
            const formattedMessage = this.formatMessage(level, context, message, data);
            window.electronAPI.log(level, formattedMessage);
        }

        // Also log to browser console (DevTools) with colored level
        const timestamp = new Date().toISOString();
        const levelColor = this.getLevelColor(level);
        
        const logArgs = [
            `[${timestamp}] %c[${level.toUpperCase()}]%c [${context}] ${message}`,
            `color: ${levelColor}`,
            'color: inherit'
        ];

        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            logArgs.push(data);
        } else if (data) {
            logArgs.push(data);
        }
        
        switch (level) {
            case 'error':
                console.error(...logArgs);
                break;
            case 'warn':
                console.warn(...logArgs);
                break;
            case 'info':
                console.info(...logArgs);
                break;
            case 'debug':
            case 'trace':
                console.log(...logArgs);
                break;
            default:
                console.log(...logArgs);
        }
    }

    /**
     * Log error message
     * @param {string} context - Context/module name
     * @param {string} message - Error message
     * @param {*} data - Additional data to log
     */
    error(context, message, data = null) {
        this.sendToElectron('error', context, message, data);
    }

    /**
     * Log warning message
     * @param {string} context - Context/module name
     * @param {string} message - Warning message
     * @param {*} data - Additional data to log
     */
    warn(context, message, data = null) {
        this.sendToElectron('warn', context, message, data);
    }

    /**
     * Log info message
     * @param {string} context - Context/module name
     * @param {string} message - Info message
     * @param {*} data - Additional data to log
     */
    info(context, message, data = null) {
        this.sendToElectron('info', context, message, data);
    }

    /**
     * Log debug message
     * @param {string} context - Context/module name
     * @param {string} message - Debug message
     * @param {*} data - Additional data to log
     */
    debug(context, message, data = null) {
        this.sendToElectron('debug', context, message, data);
    }

    /**
     * Log trace message
     * @param {string} context - Context/module name
     * @param {string} message - Trace message
     * @param {*} data - Additional data to log
     */
    trace(context, message, data = null) {
        this.sendToElectron('trace', context, message, data);
    }

    /**
     * Log API response data if enabled in configuration
     * @param {string} endpoint - API endpoint name
     * @param {*} response - API response data
     * @param {Object} context - Additional context
     */
    logApiResponse(endpoint, response, context = {}) {
        if (!LOGGING_CONFIG?.ENABLE_API_RESPONSE_LOGGING) return;
        
        this.debug('SteamAPI', `API Response: ${endpoint}`, {
            endpoint,
            ...context,
            response
        });
    }

    /**
     * Log friend filtering process for debugging
     * @param {string} step - Filtering step name
     * @param {any} data - Step data
     */
    logFriendFiltering(step, data) {
        if (!LOGGING_CONFIG.ENABLE_FRIEND_FILTERING_LOGGING) return;
        
        this.debug('FriendFilter', `Filtering step: ${step}`, data);
    }

    /**
     * Log state changes for debugging
     * @param {string} key - State key
     * @param {any} oldValue - Previous value
     * @param {any} newValue - New value
     */
    logStateChange(key, oldValue, newValue) {
        if (!LOGGING_CONFIG.ENABLE_STATE_CHANGE_LOGGING) return;
        
        this.debug('StateManager', `State changed: ${key}`, {
            key,
            oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : oldValue,
            newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : newValue
        });
    }

    /**
     * Get recent logs from buffer
     * @param {number} [limit=100] - Number of recent logs to return
     * @param {string} [level] - Filter by log level (optional)
     * @returns {Object[]} - Array of log entries
     */
    getRecentLogs(limit = 100, level = null) {
        let filteredLogs = this.logBuffer;
        
        if (level) {
            filteredLogs = this.logBuffer.filter(log => log.level.toLowerCase() === level.toLowerCase());
        }
        
        return filteredLogs.slice(-limit);
    }

    /**
     * Get logs by level
     * @param {string} level - Log level to filter
     * @param {number} [limit=100] - Number of recent logs to return
     * @returns {Object[]} - Array of log entries
     */
    getLogsByLevel(level, limit = 100) {
        const filteredLogs = this.logBuffer.filter(log => log.level.toLowerCase() === level.toLowerCase());
        return filteredLogs.slice(-limit);
    }

    /**
     * Clear log buffer
     */
    clearLogs() {
        this.logBuffer = [];
        this.info('Logger', 'Log buffer cleared');
    }

    /**
     * Get available log levels
     * @returns {string[]} - Array of available log levels
     */
    getAvailableLevels() {
        return Object.values(LOG_LEVELS);
    }

    /**
     * Check if Electron logging is available
     * @returns {boolean} - Whether Electron logging is available
     */
    isAvailable() {
        return this.isElectronAvailable;
    }
}

// Create singleton instance
const logger = new Logger();

export default logger; 