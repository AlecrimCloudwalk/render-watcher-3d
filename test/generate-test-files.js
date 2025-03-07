const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../render_output');
const totalFrames = 10;

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Function to get a random delay between min and max seconds
function getRandomDelay(minSeconds, maxSeconds) {
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
}

// Generate test files with random delays
async function generateTestFiles() {
    console.log('Starting test file generation with random intervals (15-30 seconds)...');
    
    for (let i = 0; i < totalFrames; i++) {
        const filename = `frame_${String(i).padStart(4, '0')}.png`;
        const filepath = path.join(outputDir, filename);
        
        // Create an empty file
        fs.writeFileSync(filepath, '');
        
        // Get a random delay between 15-30 seconds
        const delay = getRandomDelay(15, 30);
        const delayInSeconds = delay / 1000;
        
        console.log(`Created ${filename} - Waiting ${delayInSeconds} seconds before next frame...`);
        
        // Wait for the random delay before creating the next file
        if (i < totalFrames - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    console.log('Test file generation complete!');
}

// Clear existing files first
console.log('Clearing existing files...');
if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    for (const file of files) {
        if (file.startsWith('frame_') && file.endsWith('.png')) {
            fs.unlinkSync(path.join(outputDir, file));
        }
    }
}

generateTestFiles(); 