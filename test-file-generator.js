const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = './render_output';
const INTERVAL_MS = 30000; // 30 seconds
const FILE_EXTENSION = '.exr'; // Using .exr extension for render files
const TOTAL_FRAMES = 100; // Total frames to generate

// Ensure the output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`Creating output directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Keep track of the current frame number
let currentFrame = 0;

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
        clearInterval(intervalId);
    }
}

// Generate a file immediately
generateSequentialFrame();

// Set up interval to generate files periodically
console.log(`Starting file generation every ${INTERVAL_MS/1000} seconds...`);
console.log(`Will generate ${TOTAL_FRAMES} frames total.`);
console.log(`Press Ctrl+C to stop`);

const intervalId = setInterval(generateSequentialFrame, INTERVAL_MS); 