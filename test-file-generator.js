const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = './render_output';
const MIN_INTERVAL_SEC = 15; // Minimum interval in seconds
const MAX_INTERVAL_SEC = 30; // Maximum interval in seconds
const FILE_EXTENSION = '.exr'; // Using .exr extension for render files
const TOTAL_FRAMES = 100; // Total frames to generate

// Ensure the output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`Creating output directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Keep track of the current frame number
let currentFrame = 0;

// Function to get a random delay between min and max seconds
function getRandomDelay() {
    const delayMs = Math.floor(Math.random() * (MAX_INTERVAL_SEC - MIN_INTERVAL_SEC + 1) + MIN_INTERVAL_SEC) * 1000;
    return delayMs;
}

// Function to generate a sequential frame file
function generateSequentialFrame() {
    // Increment frame number
    currentFrame++;
    
    // Format frame number with leading zeros
    const frameNumber = currentFrame.toString().padStart(4, '0');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `render_frame_${frameNumber}_${timestamp}${FILE_EXTENSION}`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    
    // Create a small binary file (simulating an .exr file)
    const buffer = Buffer.alloc(1024); // 1KB file
    // Fill with random data
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log(`Generated frame ${currentFrame}/${TOTAL_FRAMES}: ${fileName}`);
    
    // Log total files in directory
    const files = fs.readdirSync(OUTPUT_DIR);
    console.log(`Total files in ${OUTPUT_DIR}: ${files.length}`);
    
    // Stop when we reach the total number of frames
    if (currentFrame >= TOTAL_FRAMES) {
        console.log(`All ${TOTAL_FRAMES} frames generated. Stopping.`);
        return;
    }
    
    // Schedule next frame with random delay
    const nextDelay = getRandomDelay();
    console.log(`Next frame will be generated in ${nextDelay/1000} seconds...`);
    setTimeout(generateSequentialFrame, nextDelay);
}

// Generate a file immediately
generateSequentialFrame();

console.log(`Starting file generation with random intervals (${MIN_INTERVAL_SEC}-${MAX_INTERVAL_SEC} seconds)...`);
console.log(`Will generate ${TOTAL_FRAMES} frames total.`);
console.log(`Press Ctrl+C to stop`); 