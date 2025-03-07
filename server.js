/**
 * @guidelines
 * Please read GUIDELINES.md at the start of each session
 * Current version: v1.0.0
 * Last updated: 2024-03-19
 * 
 * Key priorities:
 * 1. Frame sequence detection
 * 2. Enhanced visualization
 * 3. Remote deployment
 * 4. Error handling
 */

const express = require('express');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Terminal colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    bright: '\x1b[1m'
};

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public'));
// Serve favicon files
app.use('/favicon', express.static('favicon'));
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Store connected clients
const clients = new Set();

// Store current watch directory and state
let currentWatchDir = path.join(__dirname, 'render_output');
let watcher = null;
let totalFrames = 120; // Default total frames
let completedFrames = 0;
let startTime = Date.now();
let manualTotalFrames = null;
let wss = null; // Global WebSocket server reference

// Track frame times for statistics
let frameTimes = [];
const maxFrameTimesToKeep = 20;
let lastFrameTime = 0; // Initialize with 0 instead of hardcoded 30 seconds
let lastFrameDetectionTime = 0;
let previousFrameDetectionTime = 0;
let firstFrameDetectionTime = 0;

// Initialize file watcher
function initializeWatcher(dir) {
    console.log(`${colors.green}[INFO]${colors.reset} Initializing watcher for directory: ${dir}`);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        console.log(`${colors.yellow}[WARN]${colors.reset} Directory does not exist, creating: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Set the current watch directory
    currentWatchDir = dir;
    
    // Reset frame detection times and counts when changing directories
    lastFrameDetectionTime = 0;
    previousFrameDetectionTime = 0;
    firstFrameDetectionTime = 0;
    completedFrames = 0; // Reset completed frames count
    frameTimes = []; // Reset frame times array
    
    // Get the creation time of the first frame file if it exists
    firstFrameDetectionTime = getFirstFrameCreationTime();
    
    // Close existing watcher if any
    if (watcher) {
        try {
            watcher.close();
            console.log(`${colors.green}[INFO]${colors.reset} Closed previous watcher`);
        } catch (err) {
            console.error(`${colors.red}[ERROR]${colors.reset} Error closing previous watcher: ${err.message}`);
        }
    }
    
    // Initialize the watcher
    watcher = chokidar.watch(dir, {
        ignored: /(^|[\/\\])\../, // Ignore dot files
        persistent: true,
        ignoreInitial: false, // Process existing files
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });
    
    // Initial scan to count existing files
    console.log(`${colors.green}[INFO]${colors.reset} Starting initial scan of ${dir}`);
    
    // Handle initial scan complete
    watcher.on('ready', () => {
        console.log(`${colors.green}[INFO]${colors.reset} Initial scan complete. Ready for changes.`);
        
        // Count existing files
        try {
            console.log(`${colors.yellow}[DEBUG]${colors.reset} Starting detailed initial file count`);
            
            const files = fs.readdirSync(dir);
            console.log(`${colors.yellow}[DEBUG]${colors.reset} Total items in directory: ${files.length}`);
            
            const frameFiles = files.filter(file => {
                return /\.(png|jpg|jpeg|tif|tiff|exr|hdr|dpx)$/i.test(file);
            });
            
            console.log(`${colors.yellow}[DEBUG]${colors.reset} Found ${frameFiles.length} frame files after filtering`);
            
            // Log some of the files for debugging
            if (frameFiles.length > 0) {
                console.log(`${colors.yellow}[DEBUG]${colors.reset} First 5 frame files:`);
                frameFiles.slice(0, 5).forEach((file, index) => {
                    console.log(`  ${index + 1}. ${file}`);
                });
                
                if (frameFiles.length > 5) {
                    console.log(`${colors.yellow}[DEBUG]${colors.reset} Last 5 frame files:`);
                    frameFiles.slice(-5).forEach((file, index) => {
                        console.log(`  ${frameFiles.length - 5 + index + 1}. ${file}`);
                    });
                }
            }
            
            // Update completed frames count
            completedFrames = frameFiles.length;
            
            // If this is the first time we're detecting frames, set the first frame detection time
            // to the creation time of the first frame file
            if (firstFrameDetectionTime === 0 && frameFiles.length > 0) {
                firstFrameDetectionTime = getFirstFrameCreationTime();
                console.log(`${colors.cyan}[TIME]${colors.reset} First frame detection time set: ${new Date(firstFrameDetectionTime).toISOString()}`);
            }
            
            console.log(`${colors.green}[INFO]${colors.reset} Found ${completedFrames} existing frame files in directory.`);
            
            // Broadcast initial progress
            broadcastProgress();
            
        } catch (err) {
            console.error(`${colors.red}[ERROR]${colors.reset} Failed to read directory: ${err.message}`);
        }
    });
    
    // Watch for new files
    watcher.on('add', filePath => {
        const ext = path.extname(filePath).toLowerCase();
        const isFrameFile = /\.(png|jpg|jpeg|tif|tiff|exr|hdr|dpx)$/i.test(ext);
        
        if (isFrameFile) {
            // Check if the file has a valid frame number
            const filename = path.basename(filePath);
            const match = filename.match(/\d+/);
            
            if (!match) {
                console.log(`${colors.yellow}[WARN]${colors.reset} Ignoring file without frame number: ${filename}`);
                return;
            }
            
            const frameNumber = parseInt(match[0], 10);
            if (isNaN(frameNumber)) {
                console.log(`${colors.yellow}[WARN]${colors.reset} Ignoring file with invalid frame number: ${filename}`);
                return;
            }
            
            // Get the file creation time
            const stats = fs.statSync(filePath);
            const fileCreationTime = stats.birthtimeMs || stats.mtimeMs; // Use modification time as fallback
            
            // Store previous frame detection time
            previousFrameDetectionTime = lastFrameDetectionTime;
            
            // Update last frame detection time with the file creation time
            lastFrameDetectionTime = fileCreationTime;
            
            // If this is the first frame detected, set the first frame detection time
            if (firstFrameDetectionTime === 0) {
                firstFrameDetectionTime = getFirstFrameCreationTime();
                console.log(`${colors.cyan}[TIME]${colors.reset} First frame detection time set: ${new Date(firstFrameDetectionTime).toISOString()}`);
            }
            
            // Calculate time since last frame
            if (previousFrameDetectionTime > 0) {
                lastFrameTime = (lastFrameDetectionTime - previousFrameDetectionTime) / 1000;
                console.log(`${colors.cyan}[TIME]${colors.reset} Time since last frame: ${lastFrameTime.toFixed(1)}s`);
            }
            
            // Update completed frames count using the getCompletedFrames function
            completedFrames = getCompletedFrames();
            
            console.log(`${colors.green}[FRAME]${colors.reset} New frame detected: ${path.basename(filePath)} (Frame #${frameNumber})`);
            console.log(`${colors.green}[PROGRESS]${colors.reset} Completed frames: ${completedFrames}/${manualTotalFrames || totalFrames}`);
            
            // Update frame times based on all available frame files
            updateFrameTimes();
            
            // Broadcast progress update
            broadcastProgress();
        }
    });
    
    // Handle errors
    watcher.on('error', error => {
        console.error(`${colors.red}[ERROR]${colors.reset} Watcher error: ${error}`);
    });
    
    return watcher;
}

// API endpoint to reset frame count
app.post('/api/reset-frames', (req, res) => {
    try {
        console.log(`${colors.green}[RESET]${colors.reset} Resetting frame count`);
        
        // Reset frame count and related variables
        completedFrames = 0;
        lastFrameTime = 0;
        lastFrameDetectionTime = 0;
        previousFrameDetectionTime = 0;
        firstFrameDetectionTime = 0;
        frameTimes = [];
        
        // Re-count frames in the current directory
        completedFrames = getCompletedFrames();
        
        console.log(`${colors.green}[RESET]${colors.reset} Frame count reset. Current count: ${completedFrames}`);
        
        // Broadcast updated progress
        broadcastProgress();
        
        res.json({ success: true, completedFrames });
    } catch (error) {
        console.error(`${colors.red}[ERROR]${colors.reset} Failed to reset frame count: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API endpoint to change watch directory
app.post('/api/set-directory', (req, res) => {
    const { directory } = req.body;
    
    if (!directory) {
        return res.status(400).json({ success: false, error: 'No directory provided' });
    }
    
    try {
        // Reset frame count and related variables before changing directory
        completedFrames = 0;
        lastFrameTime = 0;
        lastFrameDetectionTime = 0;
        previousFrameDetectionTime = 0;
        firstFrameDetectionTime = 0;
        frameTimes = [];
        
        // Initialize watcher for the new directory
        watcher = initializeWatcher(directory);
        
        // Save to recent directories
        saveToRecentDirectories(directory);
        
        // Update directory path display
        updateDirectoryPath(directory);
        
        res.json({ success: true, directory });
    } catch (error) {
        console.error(`${colors.red}[ERROR]${colors.reset} Failed to set directory: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API endpoint to get server info
app.get('/api/server-info', (req, res) => {
    res.json({
        cwd: process.cwd(),
        platform: process.platform,
        defaultWatchDir: currentWatchDir
    });
});

// API endpoint to extract directory from uploaded file
app.post('/api/extract-directory', upload.single('sampleFile'), (req, res) => {
    if (!req.file) {
        console.log(`${colors.red}ERROR: No file uploaded${colors.reset}`);
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    try {
        // Get the directory from the file path
        const filePath = req.file.path;
        const fileDir = path.dirname(filePath);
        
        console.log(`${colors.cyan}FILE_UPLOADED: ${colors.yellow}${req.file.originalname}${colors.reset}`);
        console.log(`${colors.cyan}EXTRACTED_DIRECTORY: ${colors.yellow}${fileDir}${colors.reset}`);
        
        // Clean up the uploaded file
        fs.unlinkSync(filePath);
        
        // Return the directory
        res.json({ success: true, directory: fileDir });
    } catch (error) {
        console.log(`${colors.red}ERROR_EXTRACTING_DIRECTORY: ${colors.reset}${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API endpoint to set total frames manually
app.post('/api/set-total-frames', (req, res) => {
    console.log('Received request to set total frames:', req.body);
    
    const { totalFrames: newTotalFrames } = req.body;
    console.log('Extracted newTotalFrames:', newTotalFrames, 'Type:', typeof newTotalFrames);
    
    // Parse the value and check if it's a valid number greater than 0
    const parsedValue = parseInt(newTotalFrames);
    if (isNaN(parsedValue) || parsedValue < 1) {
        console.log(`${colors.red}ERROR: Invalid total frames value${colors.reset}`, {
            value: newTotalFrames,
            isNaN: isNaN(parsedValue),
            parsed: parsedValue
        });
        return res.status(400).json({ success: false, error: 'Invalid total frames value' });
    }
    
    try {
        // Update total frames
        const oldTotal = manualTotalFrames !== null ? manualTotalFrames : totalFrames;
        console.log('Current state before update:', {
            oldTotal,
            manualTotalFrames,
            totalFrames,
            completedFrames
        });
        
        manualTotalFrames = parsedValue;
        totalFrames = manualTotalFrames;
        
        console.log(`${colors.cyan}TOTAL_FRAMES_UPDATED: ${colors.yellow}${oldTotal} → ${totalFrames} (MANUAL)${colors.reset}`);
        console.log('New state after update:', {
            manualTotalFrames,
            totalFrames,
            completedFrames
        });
        
        // Broadcast updated progress
        broadcastProgress();
        
        res.json({ success: true, totalFrames });
    } catch (error) {
        console.log(`${colors.red}ERROR_SETTING_TOTAL_FRAMES: ${colors.reset}${error.message}`);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get the number of completed frames
function getCompletedFrames() {
    try {
        const files = fs.readdirSync(currentWatchDir);
        
        // Filter for frame files with valid extensions
        const frameFiles = files.filter(file => {
            return /\.(png|jpg|jpeg|tif|tiff|exr|hdr|dpx)$/i.test(file);
        });
        
        // Extract frame numbers and validate sequence
        const frameNumbers = [];
        const validFrameFiles = frameFiles.filter(file => {
            // Extract frame number from filename
            const match = file.match(/\d+/);
            if (match) {
                const frameNumber = parseInt(match[0], 10);
                if (!isNaN(frameNumber)) {
                    frameNumbers.push(frameNumber);
                    return true;
                }
            }
            console.log(`${colors.yellow}[WARN]${colors.reset} File doesn't appear to be part of a sequence: ${file}`);
            return false;
        });
        
        // Update the global completedFrames variable
        completedFrames = validFrameFiles.length;
        
        console.log(`${colors.cyan}[FRAMES]${colors.reset} Valid frame files: ${validFrameFiles.length}/${frameFiles.length}`);
        
        return validFrameFiles.length;
    } catch (err) {
        console.error(`${colors.red}[ERROR]${colors.reset} Failed to count completed frames: ${err.message}`);
        return completedFrames; // Return the last known value
    }
}

// Get the total number of frames
function getTotalFrames() {
    return manualTotalFrames !== null ? manualTotalFrames : totalFrames;
}

// Format time in hours, minutes, seconds
function formatTime(seconds) {
    if (seconds === undefined || seconds === null || seconds === Infinity || isNaN(seconds)) {
        return 'N/A';
    }
    
    // Ensure seconds is a number
    seconds = Number(seconds);
    
    if (seconds < 0) {
        return 'N/A';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m `;
    result += `${secs}s`;
    
    return result;
}

// Function to broadcast progress to all connected clients
function broadcastProgress() {
    const effectiveTotalFrames = manualTotalFrames || totalFrames;
    const percentage = (completedFrames / effectiveTotalFrames) * 100;
    
    // Server-side calculations for logging only
    const timeElapsed = firstFrameDetectionTime ? (Date.now() - firstFrameDetectionTime) / 1000 : 0;
    const timeSinceLastFrame = lastFrameDetectionTime ? (Date.now() - lastFrameDetectionTime) / 1000 : 0;
    const calculatedAvgFrameTime = completedFrames > 1 && firstFrameDetectionTime
        ? (lastFrameDetectionTime - firstFrameDetectionTime) / 1000 / (completedFrames - 1)
        : lastFrameTime || 0;
    
    // Calculate ETA for logging only
    let eta = null;
    if (calculatedAvgFrameTime > 0 && completedFrames < effectiveTotalFrames) {
        eta = calculatedAvgFrameTime * (effectiveTotalFrames - completedFrames);
        console.log(`${colors.cyan}[ETA]${colors.reset} Calculated: ${formatTime(eta)} (based on avg: ${calculatedAvgFrameTime.toFixed(1)}s)`);
    } else {
        console.log(`${colors.cyan}[ETA]${colors.reset} N/A - rendering complete or no frame time data`);
    }
    
    // Debug info for server logs only - more concise format
    console.log(`${colors.cyan}[STATS]${colors.reset} Frames: ${completedFrames}/${effectiveTotalFrames} (${percentage.toFixed(1)}%)`);
    console.log(`${colors.cyan}[STATS]${colors.reset} Times: Last=${lastFrameTime.toFixed(1)}s | Avg=${calculatedAvgFrameTime.toFixed(1)}s | Current=${timeSinceLastFrame.toFixed(1)}s | Elapsed=${formatTime(timeElapsed)}`);
    
    // Send only essential data to clients
    const message = JSON.stringify({
        type: 'update',
        completedFrames,
        totalFrames: effectiveTotalFrames,
        percentage,
        // Raw timestamps for client-side calculations
        firstFrameTimestamp: firstFrameDetectionTime || 0,
        lastFrameTimestamp: lastFrameDetectionTime || 0,
        previousFrameTimestamp: previousFrameDetectionTime || 0,
        serverTimestamp: Date.now() // Current server time
    });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Function to get the creation time of the first frame file
function getFirstFrameCreationTime() {
    try {
        if (!fs.existsSync(currentWatchDir)) {
            return 0;
        }
        
        // Get all frame files
        const files = fs.readdirSync(currentWatchDir);
        
        // Filter for common frame file extensions
        const frameFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return /\.(png|jpg|jpeg|tif|tiff|exr|hdr|dpx)$/i.test(ext);
        });
        
        if (frameFiles.length === 0) {
            return 0;
        }
        
        // Try to sort frame files by frame number if they follow a pattern
        // This handles various naming conventions like:
        // - render_frame_001.png
        // - frame001.png
        // - 001.png
        // - scene_001.png
        // - etc.
        frameFiles.sort((a, b) => {
            // Extract numbers from filenames
            const numA = a.match(/\d+/);
            const numB = b.match(/\d+/);
            
            if (numA && numB) {
                return parseInt(numA[0], 10) - parseInt(numB[0], 10);
            }
            
            // Fall back to alphabetical sorting if no numbers found
            return a.localeCompare(b);
        });
        
        // Get the first frame file
        const firstFrameFile = frameFiles[0];
        const firstFramePath = path.join(currentWatchDir, firstFrameFile);
        
        // Get the creation time of the first frame file
        const stats = fs.statSync(firstFramePath);
        
        // Use birthtime if available, otherwise fall back to mtime (modification time)
        // Some file systems don't support birthtime
        const creationTime = stats.birthtimeMs || stats.mtimeMs;
        
        console.log(`${colors.cyan}[TIME]${colors.reset} First frame file: ${firstFrameFile}`);
        console.log(`${colors.cyan}[TIME]${colors.reset} First frame creation time: ${new Date(creationTime).toISOString()}`);
        
        return creationTime;
    } catch (error) {
        console.error(`${colors.red}[ERROR]${colors.reset} Error getting first frame creation time:`, error);
        return 0;
    }
}

// Function to get the most recent frame files and their creation times
function getRecentFrameFiles() {
    try {
        if (!fs.existsSync(currentWatchDir)) {
            return [];
        }
        
        // Get all frame files
        const files = fs.readdirSync(currentWatchDir);
        
        // Filter for common frame file extensions
        const frameFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return /\.(png|jpg|jpeg|tif|tiff|exr|hdr|dpx)$/i.test(ext);
        });
        
        if (frameFiles.length === 0) {
            return [];
        }
        
        // Get creation times for all frame files
        const frameFilesWithTimes = frameFiles.map(file => {
            const filePath = path.join(currentWatchDir, file);
            const stats = fs.statSync(filePath);
            const creationTime = stats.birthtimeMs || stats.mtimeMs;
            
            // Extract frame number if possible
            let frameNumber = null;
            const match = file.match(/\d+/);
            if (match) {
                frameNumber = parseInt(match[0], 10);
            }
            
            return {
                file,
                path: filePath,
                creationTime,
                frameNumber
            };
        });
        
        // Filter out files that don't have a valid frame number
        const validFrameFiles = frameFilesWithTimes.filter(frame => {
            if (frame.frameNumber === null || isNaN(frame.frameNumber)) {
                console.log(`${colors.yellow}[WARN]${colors.reset} Ignoring file without valid frame number: ${frame.file}`);
                return false;
            }
            return true;
        });
        
        // Sort by creation time (newest first)
        validFrameFiles.sort((a, b) => b.creationTime - a.creationTime);
        
        return validFrameFiles;
    } catch (error) {
        console.error(`${colors.red}[ERROR]${colors.reset} Error getting recent frame files:`, error);
        return [];
    }
}

// Function to update frame times based on actual file creation times
function updateFrameTimes() {
    const recentFrames = getRecentFrameFiles();
    
    if (recentFrames.length >= 2) {
        // Get the two most recent frames
        const latestFrame = recentFrames[0];
        const previousFrame = recentFrames[1];
        
        // Update frame detection times
        const oldLastFrameTime = lastFrameTime;
        lastFrameDetectionTime = latestFrame.creationTime;
        previousFrameDetectionTime = previousFrame.creationTime;
        
        // Calculate last frame time
        lastFrameTime = (lastFrameDetectionTime - previousFrameDetectionTime) / 1000;
        
        // Set firstFrameDetectionTime if not already set
        if (firstFrameDetectionTime === 0 && recentFrames.length > 0) {
            // Get the oldest frame
            const oldestFrame = recentFrames[recentFrames.length - 1];
            firstFrameDetectionTime = oldestFrame.creationTime;
            console.log(`${colors.cyan}[TIME_UPDATE]${colors.reset} Set first frame time to ${new Date(firstFrameDetectionTime).toISOString()}`);
        }
        
        // Update completed frames count if needed
        if (completedFrames < recentFrames.length) {
            completedFrames = recentFrames.length;
            console.log(`${colors.cyan}[TIME_UPDATE]${colors.reset} Updated completed frames to ${completedFrames}`);
        }
        
        // Extract frame numbers for cleaner logging
        const latestFrameNum = latestFrame.frameNumber || 'unknown';
        const previousFrameNum = previousFrame.frameNumber || 'unknown';
        
        // Format timestamps for cleaner logging
        const latestTime = new Date(latestFrame.creationTime).toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format
        const previousTime = new Date(previousFrame.creationTime).toISOString().split('T')[1].split('.')[0];
        
        console.log(`${colors.cyan}[TIME_UPDATE]${colors.reset} Frame times updated:`);
        console.log(`  Latest: Frame #${latestFrameNum} @ ${latestTime}`);
        console.log(`  Previous: Frame #${previousFrameNum} @ ${previousTime}`);
        console.log(`  Last frame time: ${lastFrameTime.toFixed(1)}s (was ${oldLastFrameTime.toFixed(1)}s)`);
        
        // Broadcast progress update if the frame time has changed significantly
        if (Math.abs(lastFrameTime - oldLastFrameTime) > 0.1) {
            console.log(`${colors.cyan}[TIME_UPDATE]${colors.reset} Frame time changed significantly, broadcasting update`);
            broadcastProgress();
        }
    }
}

// Call updateFrameTimes periodically to ensure accurate frame times
setInterval(updateFrameTimes, 5000);

// Create HTTP server
const server = app.listen(port, () => {
    console.log(`${colors.green}${colors.bright}=== RENDER PROGRESS MONITOR ====${colors.reset}`);
    console.log(`${colors.cyan}SERVER_RUNNING: ${colors.yellow}http://localhost:${port}${colors.reset}`);
    
    // Set up WebSocket server using the function
    setupWebSocketServer(server);
    
    // Initialize with default directory
    initializeWatcher(currentWatchDir);
});

// Function to setup WebSocket server
function setupWebSocketServer(server) {
    wss = new WebSocket.Server({ server });
    
    wss.on('connection', (ws) => {
        console.log(`${colors.green}[WEBSOCKET]${colors.reset} Client connected`);
        
        // Send initial state to the client
        sendInitialState(ws);
        
        // Listen for messages from clients
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log(`${colors.green}[WEBSOCKET]${colors.reset} Received message:`, data);
                
                if (data.type === 'setTotalFrames') {
                    // Validate the total frames value
                    const newTotalFrames = parseInt(data.totalFrames, 10);
                    
                    if (Number.isInteger(newTotalFrames) && newTotalFrames > 0) {
                        manualTotalFrames = newTotalFrames;
                        console.log(`${colors.green}[WEBSOCKET]${colors.reset} Total frames set to ${manualTotalFrames}`);
                        
                        // Broadcast the updated progress immediately
                        broadcastProgress();
                    } else {
                        console.log(`${colors.yellow}[WEBSOCKET]${colors.reset} Invalid total frames value: ${data.totalFrames}`);
                    }
                } else if (data.type === 'requestState') {
                    // Send the current state to the requesting client
                    console.log(`${colors.green}[WEBSOCKET]${colors.reset} State requested, sending current state`);
                    sendInitialState(ws);
                } else if (data.type === 'resetFrames') {
                    // Reset frame count
                    console.log(`${colors.green}[WEBSOCKET]${colors.reset} Resetting frame count`);
                    
                    // Reset frame count and related variables
                    completedFrames = 0;
                    lastFrameTime = 0;
                    lastFrameDetectionTime = 0;
                    previousFrameDetectionTime = 0;
                    firstFrameDetectionTime = 0;
                    frameTimes = [];
                    
                    // Re-count frames in the current directory
                    completedFrames = getCompletedFrames();
                    
                    console.log(`${colors.green}[WEBSOCKET]${colors.reset} Frame count reset. Current count: ${completedFrames}`);
                    
                    // Broadcast updated progress
                    broadcastProgress();
                }
            } catch (error) {
                console.error(`${colors.red}[WEBSOCKET]${colors.reset} Error parsing message:`, error);
            }
        });
        
        ws.on('close', () => {
            console.log(`${colors.yellow}[WEBSOCKET]${colors.reset} Client disconnected`);
        });
    });
    
    return wss;
}

// Function to send the initial state to a client
function sendInitialState(ws) {
    if (ws.readyState === WebSocket.OPEN) {
        const effectiveTotalFrames = manualTotalFrames || totalFrames;
        const percentage = (completedFrames / effectiveTotalFrames) * 100;
        
        // Send only essential data to clients
        const message = JSON.stringify({
            type: 'initialState',
            completedFrames,
            totalFrames: effectiveTotalFrames,
            percentage,
            // Raw timestamps for client-side calculations
            firstFrameTimestamp: firstFrameDetectionTime || 0,
            lastFrameTimestamp: lastFrameDetectionTime || 0,
            previousFrameTimestamp: previousFrameDetectionTime || 0,
            serverTimestamp: Date.now() // Current server time
        });
        
        console.log(`${colors.green}[WEBSOCKET]${colors.reset} Sending initial state: ${completedFrames}/${effectiveTotalFrames} (${percentage.toFixed(2)}%)`);
        ws.send(message);
    }
}