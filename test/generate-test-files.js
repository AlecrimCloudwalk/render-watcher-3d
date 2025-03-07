const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '../render_output');
const totalFrames = 10;

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Generate test files with delay
async function generateTestFiles() {
    for (let i = 0; i < totalFrames; i++) {
        const filename = `frame_${String(i).padStart(4, '0')}.png`;
        const filepath = path.join(outputDir, filename);
        
        // Create an empty file
        fs.writeFileSync(filepath, '');
        console.log(`Created ${filename}`);
        
        // Wait 2 seconds between files
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log('Test file generation complete!');
}

generateTestFiles(); 