// Set dynamic color palette
let controls; // Declare controls at the top level
let completedFrames = 0; // Global variable for completed frames
let totalFrames = 100; // Global variable for total frames
let frameCounter; // Global variable for frame counter element

// Add a debounce mechanism to prevent too frequent visualization updates
let lastVisualizationUpdateTime = 0;
const VISUALIZATION_UPDATE_COOLDOWN = 100; // 100ms cooldown between updates

// Track the last visualization values to prevent redundant updates
let lastVisualizationValues = {
    completedFrames: 0,
    totalFrames: 0
};

// Add a debounce mechanism for WebSocket updates
let lastWebSocketUpdateTime = 0;
const WEBSOCKET_UPDATE_COOLDOWN = 2000; // Increase to 2 seconds to reduce log spam

// Track the last frame number that triggered particles
let lastParticleEmissionFrame = 0;

// Function to create a "pop" effect with particles when animation completes
let lastParticleEmissionTime = 0;
const PARTICLE_EMISSION_COOLDOWN = 5000; // 5 second cooldown between emissions

// Global variable to store manually set total frames
window.manualTotalFrames = null;

// Track last frame data for comparison
let lastCompletedFrames = 0;
let lastTotalFrames = 1;

// Global variables for Three.js
let socket = null;
let scene, camera, renderer;
let progressRing, progressFill;
let colorPalette = [];
let isWebGLAvailable = true;

// Global variables to store timestamps
let firstFrameTimestamp = 0;
let lastFrameTimestamp = 0;
let previousFrameTimestamp = 0;
let serverClientTimeDiff = 0; // Difference between server and client time

function generateColorPalette() {
    // Generate a random hue (0-360)
    const hue = Math.floor(Math.random() * 360);
    
    // Calculate RGB values for CSS variables that need rgba
    const primaryRgb = hslToRgb(hue/360, 0.4, 0.5);
    
    // Set the CSS variables with less saturated colors
    document.documentElement.style.setProperty('--color-primary', `hsl(${hue}, 40%, 50%)`);
    document.documentElement.style.setProperty('--color-primary-dark', `hsl(${hue}, 40%, 40%)`);
    document.documentElement.style.setProperty('--color-primary-light', `hsl(${hue}, 40%, 60%)`);
    document.documentElement.style.setProperty('--color-background', `hsl(${hue}, 15%, 8%)`);
    document.documentElement.style.setProperty('--color-surface', `hsl(${hue}, 15%, 12%)`);
    document.documentElement.style.setProperty('--color-text', `hsl(${hue}, 10%, 95%)`);
    document.documentElement.style.setProperty('--color-text-secondary', `hsl(${hue}, 10%, 75%)`);
    document.documentElement.style.setProperty('--color-accent', `hsl(${(hue + 180) % 360}, 40%, 60%)`);
    document.documentElement.style.setProperty('--color-primary-rgb', `${primaryRgb[0]}, ${primaryRgb[1]}, ${primaryRgb[2]}`);
    
    // Log the generated palette
    console.log("Generated color palette with hue:", hue);
    
    // Log dot pattern element status
    setTimeout(() => {
        const dotPattern = document.querySelector('.dot-pattern');
        if (dotPattern) {
            const styles = window.getComputedStyle(dotPattern);
            console.log('Dot pattern element found:', {
                opacity: styles.opacity,
                zIndex: styles.zIndex,
                visibility: styles.visibility,
                display: styles.display,
                backgroundImage: styles.backgroundImage
            });
        } else {
            console.log('Dot pattern element not found in DOM');
        }
    }, 1000);
    
    return hue;
}

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Generate the color palette before creating Three.js scene
const hue = generateColorPalette();

// Check WebGL capabilities
function checkWebGLCapabilities() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) {
            console.error("WebGL not supported");
            return { supported: false };
        }
        
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        
        const capabilities = {
            supported: true,
            vendor: vendor,
            renderer: renderer,
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
            antialias: gl.getContextAttributes().antialias,
            extensions: gl.getSupportedExtensions()
        };
        
        console.log("WebGL Capabilities:", capabilities);
        return capabilities;
    } catch (e) {
        console.error("Error checking WebGL capabilities:", e);
        return { supported: false, error: e.message };
    }
}

// Check WebGL capabilities
const webGLCapabilities = checkWebGLCapabilities();

// Three.js setup
// Use the already declared scene variable instead of redeclaring
scene = new THREE.Scene();
scene.background = null; // Remove solid background to allow dot pattern to show through

// Create a responsive camera setup
// Use the already declared camera variable
let aspect, frustumSize;
function setupCamera() {
    aspect = window.innerWidth / window.innerHeight;
    frustumSize = aspect < 1 ? 15 : 10; // Larger frustum size for portrait mode
    
    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
    );
    
    // Position camera
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
}

// Initial camera setup
setupCamera();

// Create renderer and append to container
// Use the already declared renderer variable instead of redeclaring
renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance"
});
const canvasContainer = document.getElementById('canvas-container');

// Force a higher pixel ratio for better quality (use 2 instead of device pixel ratio)
renderer.setPixelRatio(Math.max(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Log renderer settings for debugging
console.log("Renderer settings:", {
    pixelRatio: renderer.getPixelRatio(),
    devicePixelRatio: window.devicePixelRatio,
    forcedPixelRatio: Math.max(2, window.devicePixelRatio),
    size: renderer.getSize(new THREE.Vector2()),
    domElement: {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        style: {
            width: renderer.domElement.style.width,
            height: renderer.domElement.style.height
        }
    }
});

function resizeRenderer() {
    const container = document.getElementById('visualization-container');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Check if we're in portrait mode
    const isPortrait = height > width;
    
    // Log container and canvas dimensions
    console.log("Resize dimensions:", {
        container: {
            width: width,
            height: height
        },
        canvas: {
            width: renderer.domElement.width,
            height: renderer.domElement.height,
            style: {
                width: renderer.domElement.style.width,
                height: renderer.domElement.style.height
            }
        },
        pixelRatio: renderer.getPixelRatio()
    });
    
    // Adjust camera and renderer based on orientation
    if (camera && renderer) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        
        // Set size but maintain the high pixel ratio
        renderer.setSize(width, height, false); // false to avoid setting style
        renderer.setPixelRatio(Math.max(2, window.devicePixelRatio));
        
        // In portrait mode, move the visualization up slightly
        if (isPortrait && visualContainer) {
            visualContainer.position.y = 1.5; // Move up in portrait mode
        } else if (visualContainer) {
            visualContainer.position.y = 0; // Center in landscape mode
        }
    }
    
    // Update camera on resize
    setupCamera();
    
    // Update controls target if they exist
    if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
    }
}

// Initial renderer setup
resizeRenderer();
canvasContainer.appendChild(renderer.domElement);

// Set renderer properties
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000, 0);

// Make sure the canvas fills the container
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.display = 'block';

// Handle window resize
window.addEventListener('resize', () => {
    resizeRenderer();
});

// Create a container for all visualization elements
const visualContainer = new THREE.Group();
scene.add(visualContainer);

// Controls
controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false; // Disable zoom with scroll wheel
controls.enablePan = false; // Disable panning
controls.enableRotate = true; // Enable rotation

// Progress ring setup
const segmentCount = 60; // Number of segments in the ring
const ringRadius = 4; // Radius of the progress ring
const ringThickness = 0.4; // Thickness of the progress ring
let progressSegments = []; // Changed from const to let
// Use the already declared progressRing variable

// Create progress ring visualization
function createProgressRing() {
    // Clear existing objects
    while(visualContainer.children.length > 0) {
        visualContainer.remove(visualContainer.children[0]);
    }
    
    const colors = getThemeColors();
    
    // Create ring container
    progressRing = new THREE.Group();
    visualContainer.add(progressRing);
    
    // Log camera and lighting setup
    console.log("Camera setup:", {
        position: camera.position,
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        type: camera.isOrthographicCamera ? "Orthographic" : "Perspective"
    });
    
    console.log("Scene setup:", {
        background: scene.background,
        children: scene.children.length
    });
    
    // Create segments - split into front and back halves
    progressSegments = [];
    
    // Create a container for the back half (segments that should be behind text)
    const backHalf = new THREE.Group();
    backHalf.renderOrder = -1; // Render behind text
    progressRing.add(backHalf);
    
    // Create a container for the front half (segments that should be in front of text)
    const frontHalf = new THREE.Group();
    frontHalf.renderOrder = 1; // Render in front of text
    progressRing.add(frontHalf);
    
    for (let i = 0; i < segmentCount; i++) {
        const angle = (i / segmentCount) * Math.PI * 2;
        const nextAngle = ((i + 1) / segmentCount) * Math.PI * 2;
        
        // Log geometry parameters for the first segment
        if (i === 0) {
            console.log("Ring segment geometry parameters:", {
                innerRadius: ringRadius - ringThickness/1.5,
                outerRadius: ringRadius + ringThickness/1.5,
                radialSegments: 32,
                thetaSegments: 3,
                thetaStart: angle,
                thetaLength: nextAngle - angle,
                segmentCount: segmentCount
            });
        }
        
        // Create a segment (curved plane) with increased thickness and much higher detail
        const segmentGeometry = new THREE.RingGeometry(
            ringRadius - ringThickness/1.5, // Increased thickness by making inner radius smaller
            ringRadius + ringThickness/1.5, // Increased thickness by making outer radius larger
            32, // Significantly increase radial segments for much smoother edges
            3,  // Add some theta segments for better detail
            angle, 
            (nextAngle - angle)
        );
        
        // Use MeshBasicMaterial instead of MeshLambertMaterial to ignore lighting completely
        const segmentMaterial = new THREE.MeshBasicMaterial({
            color: colors.primary,
            transparent: true,
            opacity: 0.8, // Increased from 0.6 for better visibility
            side: THREE.DoubleSide
        });
        
        const segment = new THREE.Mesh(segmentGeometry, segmentMaterial);
        segment.rotation.x = -Math.PI / 2; // Rotate to horizontal plane (flipped to correct orientation)
        
        // Determine which half to add to based on angle
        // Front half: 270° to 90° (or -90° to 90°)
        // Back half: 90° to 270°
        const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const isFrontHalf = (normalizedAngle >= Math.PI * 1.5 || normalizedAngle <= Math.PI * 0.5);
        
        // Add to appropriate half and store reference
        if (isFrontHalf) {
            frontHalf.add(segment);
        } else {
            backHalf.add(segment);
        }
        progressSegments.push(segment);
        
        // Store segment creation information for debugging
        if (i % 10 === 0 || i === 0 || i === segmentCount - 1) {
            console.log(`SEGMENT_CREATION - Segment ${i}:`, {
                angle: (angle * 180 / Math.PI).toFixed(1) + '°',
                normalizedAngle: (normalizedAngle * 180 / Math.PI).toFixed(1) + '°',
                isFrontHalf,
                index: progressSegments.length - 1
            });
        }
    }
    
    // Create bright, high-contrast colors for particles
    const brightAccent = new THREE.Color(0xff00ff); // Bright magenta
    const brightPrimary = new THREE.Color(0x00ffff); // Bright cyan
    
    // Add particles to the ring
    addParticles(frontHalf, backHalf);
    
    // Add orbiting planets after creating the segments
    addOrbitingPlanets(frontHalf, backHalf);
    
    // Add debug logging for the ring segments
    console.log("Ring segments created:", {
        totalSegments: progressSegments.length,
        frontHalfCount: frontHalf.children.length,
        backHalfCount: backHalf.children.length,
        materialProperties: progressSegments[0] ? {
            opacity: progressSegments[0].material.opacity,
            color: progressSegments[0].material.color
        } : "No segments created"
    });
    
    // Log segment order to verify they're in the correct sequence
    for (let i = 0; i < progressSegments.length; i += 10) {
        const segment = progressSegments[i];
        // Calculate the expected angle for this segment
        const expectedAngle = (i / segmentCount) * Math.PI * 2;
        const expectedAngleDegrees = (expectedAngle * 180 / Math.PI).toFixed(1);
        
        // Get the actual angle from the segment geometry
        const segmentGeometry = segment.geometry;
        const actualStartAngle = segmentGeometry.parameters.thetaStart;
        const actualAngleDegrees = (actualStartAngle * 180 / Math.PI).toFixed(1);
        
    }
    
    // Debug logging for particles - with proper checks to avoid errors
    if (progressRing.children.length > 0 && 
        progressRing.children[0].children.length > 0) {
        const sampleParticle = progressRing.children[0].children[0]; // First particle in first half

    } else {
        console.log("No particles found to sample");
    }
    
    // Tilt the ring slightly for better perspective
    progressRing.rotation.x = Math.PI * 0.15;
    
    
    // Initialize visualization with default values to make particles visible immediately
    // This ensures particles are visible even before the first WebSocket update
    updateVisualization(0, 100);
    
    return progressRing;
}

// Add orbiting planets around the progress ring
function addOrbitingPlanets(frontHalf, backHalf) {
    // Get colors from the theme
    const colors = getThemeColors();
    const darkColor = colors.primary.clone().multiplyScalar(0.7); // Darker version of primary color
    
    // Create planets with different sizes and orbit distances
    const planetConfigs = [
        { size: 0.2, distance: ringRadius * 1.3, speed: 0.004, color: darkColor },  // Increased from 0.001
        { size: 0.15, distance: ringRadius * 0.7, speed: 0.006, color: darkColor }, // Increased from 0.002
        { size: 0.25, distance: ringRadius * 1.5, speed: 0.003, color: darkColor }, // Increased from 0.0005
        { size: 0.1, distance: ringRadius * 0.9, speed: 0.008, color: darkColor },  // Increased from 0.003
        { size: 0.18, distance: ringRadius * 1.1, speed: 0.005, color: darkColor }  // Increased from 0.0015
    ];
    
    planetConfigs.forEach(config => {
        // Create planet geometry and material
        const planetGeometry = new THREE.SphereGeometry(config.size, 16, 16);
        const planetMaterial = new THREE.MeshBasicMaterial({
            color: config.color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        // Create two planets - one for front half and one for back half
        const frontPlanet = new THREE.Mesh(planetGeometry, planetMaterial.clone());
        const backPlanet = new THREE.Mesh(planetGeometry, planetMaterial.clone());
        
        // Random starting angle
        const startAngle = Math.random() * Math.PI * 2;
        
        // Position planets
        const x = Math.cos(startAngle) * config.distance;
        const z = Math.sin(startAngle) * config.distance;
        const y = (Math.random() * 2 - 1) * 0.2; // Small Y variation
        
        frontPlanet.position.set(x, y, z);
        backPlanet.position.set(x, y, z);
        
        // Store orbit data
        const userData = {
            orbitAngle: startAngle,
            orbitSpeed: config.speed,
            orbitDistance: config.distance,
            isPlanet: true, // Flag to identify as a planet
            isFront: true // Flag to identify as a front planet
        };
        
        frontPlanet.userData = {...userData};
        backPlanet.userData = {...userData, isFront: false};
        
        // Add planets to appropriate halves
        frontHalf.add(frontPlanet);
        backHalf.add(backPlanet);
        
        console.log(`Added planet with size ${config.size} at distance ${config.distance}`);
    });
}

// Update the progress ring visualization based on completion
function updateVisualization(completedFrames, totalFrames) {
    if (!progressRing) return;
    
    // Skip if the values haven't changed
    if (completedFrames === lastVisualizationValues.completedFrames && 
        totalFrames === lastVisualizationValues.totalFrames) {
        return;
    }
    
    // Check if we're within the cooldown period - use a very short cooldown for animations
    const currentTime = Date.now();
    if (currentTime - lastVisualizationUpdateTime < 16) { // 16ms = ~60fps
        // Skip this update if it's too soon after the last one
        return;
    }
    
    // Update the last update time and values
    lastVisualizationUpdateTime = currentTime;
    lastVisualizationValues = {
        completedFrames,
        totalFrames
    };
    
    // Log when visualization is updated (but not too frequently)
    if (Math.random() < 0.01) {
        console.log('Updating visualization:', { 
            completedFrames, 
            totalFrames, 
            ratio: totalFrames > 0 ? (completedFrames / totalFrames).toFixed(2) : 0,
            timestamp: new Date().toISOString()
        });
    }
    
    // Get the manually set total frames if available
    const effectiveTotalFrames = window.manualTotalFrames || totalFrames;
    
    // Calculate completion ratio based on effective total frames
    const completionRatio = effectiveTotalFrames > 0 ? completedFrames / effectiveTotalFrames : 0;
    const completedSegments = Math.floor(completionRatio * segmentCount);
    const partialCompletion = (completionRatio * segmentCount) % 1; // Fractional part for smooth transitions
    
    // Log detailed segment information (but not too frequently)
    if (Math.random() < 0.01) {
        console.log('SEGMENT_DEBUG - Updating segments:', {
            completedFrames,
            effectiveTotalFrames,
            completionRatio: completionRatio.toFixed(3),
            completedSegments,
            totalSegments: segmentCount,
            partialCompletion,
            timestamp: new Date().toISOString()
        });
    }
    
    // Get theme colors for reference
    const colors = getThemeColors();
    
    // Create arrays to track segment states for debugging
    const segmentStates = [];
    
    // Update segments in their original order
    // This ensures a consistent animation in a clockwise direction
    progressSegments.forEach((segment, index) => {
        // Store the original angle for this segment (for debugging)
        const segmentAngle = (index / segmentCount) * Math.PI * 2;
        const normalizedAngle = ((segmentAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const angleDegrees = (normalizedAngle * 180 / Math.PI).toFixed(1);
        
        let segmentState = 'inactive';
        
        if (index < completedSegments) {
            // Completed segment - fully opaque
            segment.material.opacity = 1.0;
            // For MeshBasicMaterial, we adjust color directly
            // Use a brighter version of the primary color
            segment.material.color = colors.primary.clone().multiplyScalar(1.2);
            segmentState = 'completed';
            
            // Ensure scale is reset to normal
            segment.scale.set(1, 1, 1);
        } else if (index === completedSegments) {
            // Current segment - partially animated based on partial completion
            const partialOpacity = 0.3 + (partialCompletion * 0.7); // Smooth opacity transition from 0.3 to 1.0
            
            // Make the current segment blink/pulse with a more pronounced effect
            const time = Date.now() * 0.002; // Slower pulse
            const pulseIntensity = 0.2 + Math.sin(time) * 0.2; // More subtle pulse between 0 and 0.4
            
            // Increase opacity based on completion and add pulsing effect
            segment.material.opacity = partialOpacity + pulseIntensity * 0.1;
            
            // Create a more vibrant color effect for the active segment
            // Smoothly interpolate between secondary and primary colors based on completion
            const lerpFactor = partialCompletion; // Lerp from 0.0 to 1.0 based on completion
            segment.material.color = colors.secondary.clone().lerp(colors.primary.clone().multiplyScalar(1.2), lerpFactor);
            segmentState = 'active';
            
            // Add a subtle scale animation to the current segment
            const scaleEffect = 1.0 + pulseIntensity * 0.05; // Subtle scale between 1.0 and 1.05
            segment.scale.set(scaleEffect, scaleEffect, scaleEffect);
        } else if (index === completedSegments + 1) {
            // Next segment - slightly highlighted to show it's coming next
            segment.material.opacity = 0.4; // Slightly more visible than future segments
            segment.material.color = colors.secondary.clone().lerp(colors.primary.clone(), 0.2);
            segmentState = 'next';
            
            // Ensure scale is reset to normal
            segment.scale.set(1, 1, 1);
        } else {
            // Future segment
            segment.material.opacity = 0.3;
            segment.material.color = colors.secondary.clone();
            segmentState = 'future';
            
            // Ensure scale is reset to normal
            segment.scale.set(1, 1, 1);
        }
        
        // Store segment state for debugging
        segmentStates.push({
            index,
            angle: angleDegrees + '°',
            state: segmentState,
            opacity: segment.material.opacity.toFixed(2)
        });
    });
    
    // Log detailed segment states (but not too frequently)
    if (Math.random() < 0.005) {
        console.log('SEGMENT_DEBUG - Segment states:');
        // Log first 5 segments
        segmentStates.slice(0, 5).forEach(state => {
            console.log(`  Segment ${state.index} (${state.angle}): ${state.state}, opacity: ${state.opacity}`);
        });
        console.log('  ...');
        // Log segments around the active one
        const activeIndex = completedSegments;
        const start = Math.max(0, activeIndex - 2);
        const end = Math.min(segmentCount - 1, activeIndex + 2);
        console.log(`  Active segment area (${start}-${end}):`);
        segmentStates.slice(start, end + 1).forEach(state => {
            console.log(`  Segment ${state.index} (${state.angle}): ${state.state}, opacity: ${state.opacity}`);
        });
        // Log last 5 segments
        console.log('  ...');
        segmentStates.slice(-5).forEach(state => {
            console.log(`  Segment ${state.index} (${state.angle}): ${state.state}, opacity: ${state.opacity}`);
        });
    }
    
    // Get the progress bar color to match
    const progressBarColor = getComputedStyle(document.querySelector('.progress-fill')).backgroundColor;
    const rgbMatch = progressBarColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    let progressColor;
    
    if (rgbMatch) {
        // Convert RGB to hex for Three.js
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        progressColor = new THREE.Color(r/255, g/255, b/255);
    } else {
        // Fallback to a bright color if we can't get the progress bar color
        progressColor = new THREE.Color(0x00ff00); // Bright green
    }
    
    // Create bright, high-contrast colors for particles
    const brightAccent = progressColor; // Use progress bar color
    const brightPrimary = new THREE.Color(0x00ffff); // Bright cyan
    
    // IMPORTANT: Make ALL particles visible with bright colors
    // Process both front and back halves
    progressRing.children.forEach(half => {
        half.children.forEach(child => {
            // Handle particles
            if (child.userData && child.userData.isParticle) {
                // Calculate normalized angle (0 to 2π)
                const particleAngleNormalized = ((child.userData.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const completionAngle = completionRatio * Math.PI * 2;
                
                // Determine if this particle is in the completed area
                const isInCompletedArea = particleAngleNormalized <= completionAngle;
                
                // Make ALL particles visible with different properties
                if (isInCompletedArea) {
                    // Particles in completed area - full brightness with bright color
                    child.material.opacity = 1.0;
                    child.material.color = brightAccent;
                    child.scale.setScalar(child.userData.baseSize * 1.5);
                    // Increase orbit radius for more noticeable movement
                    child.userData.orbitRadius = 0.5 + Math.random() * 0.5;
                } else {
                    // Particles in uncompleted area - still bright but different color
                    child.material.opacity = 0.7;
                    child.material.color = brightPrimary;
                    child.scale.setScalar(child.userData.baseSize * 1.0);
                    // Smaller orbit radius
                    child.userData.orbitRadius = 0.3 + Math.random() * 0.3;
                }
                
                // Make sure orbit speed is significant enough to be noticeable
                child.userData.orbitSpeed = Math.max(child.userData.orbitSpeed, 0.05);
                
                // Force a minimum opacity to ensure all particles are visible
                child.material.opacity = Math.max(child.material.opacity, 0.7);
            }
            
            // Handle planets
            if (child.userData && child.userData.isPlanet) {
                // Update planet color to match progress bar
                child.material.color = progressColor;
                
                // Make planets more visible based on completion
                child.material.opacity = 0.7 + completionRatio * 0.3;
            }
        });
    });
    
    // Do NOT rotate the ring based on progress - keep it consistent
    // progressRing.rotation.z = completionRatio * Math.PI * 0.5;
    
    // Update frame counter
    document.getElementById('frame-counter').textContent = `${completedFrames}/${totalFrames}`;
    
    // Update progress bar
    updateProgressBar(completionRatio * 100);
}

// Get colors from CSS variables for Three.js objects
function getThemeColors() {
    // Get theme colors from CSS variables or use defaults
    const getColorFromCSS = (varName, defaultColor) => {
        const color = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return color ? new THREE.Color(color) : new THREE.Color(defaultColor);
    };
    
    // Get primary and accent colors - use the correct CSS variable names
    const primary = getColorFromCSS('--color-primary', '#00aaff');
    const accent = getColorFromCSS('--color-accent', '#ff00aa');
    
    // Create a secondary color (darker version of primary for inactive segments)
    const secondary = new THREE.Color(primary).multiplyScalar(0.6);
    return {
        primary,
        accent,
        secondary
    };
}

// Directory selection elements
const currentDirDisplay = document.getElementById('currentDir');
const manualDirInput = document.getElementById('manualDirPath');
const setDirButton = document.getElementById('setDir');

console.log('DOM Elements:', {
    frameCounter: frameCounter ? 'Found' : 'Not Found',
    setDirButton: setDirButton ? 'Found' : 'Not Found'
});

// Recent directories storage
let recentDirectories = [];
try {
    const storedDirs = localStorage.getItem('recentDirectories');
    if (storedDirs) {
        recentDirectories = JSON.parse(storedDirs);
    }
} catch (error) {
    console.error('Error loading recent directories:', error);
}

// Function to save a directory to recent list
function saveToRecentDirectories(dir) {
    try {
        // Add to the beginning of the array
        const index = recentDirectories.indexOf(dir);
        if (index !== -1) {
            // Remove from current position
            recentDirectories.splice(index, 1);
        }
        
        // Add to the beginning
        recentDirectories.unshift(dir);
        
        // Keep only the last 5 directories
        if (recentDirectories.length > 5) {
            recentDirectories = recentDirectories.slice(0, 5);
        }
        
        // Save to localStorage
        localStorage.setItem('recentDirectories', JSON.stringify(recentDirectories));
    } catch (error) {
        console.error('Error saving recent directories:', error);
    }
}

// Handle manual directory input
setDirButton.addEventListener('click', () => {
    console.log('SET DIR BUTTON CLICKED');
    const dirPath = manualDirInput.value.trim();
    if (dirPath) {
        currentDirDisplay.textContent = `STATUS: ATTEMPTING_TO_SET_${dirPath}`;
        updateDirectoryPath(dirPath);
    } else {
        currentDirDisplay.textContent = 'STATUS: ERROR_NO_DIRECTORY_SPECIFIED';
        setTimeout(() => {
            currentDirDisplay.textContent = 'STATUS: PLEASE_ENTER_DIRECTORY';
        }, 2000);
    }
});

// Also handle Enter key in the input field
manualDirInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
        setDirButton.click();
    }
});

// Function to update directory path in UI and server
function updateDirectoryPath(dirPath) {
    console.log('Updating directory path to:', dirPath);
    
    fetch('/api/set-directory', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory: dirPath })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Directory set response:', data);
        
        if (data.success) {
            currentDirDisplay.textContent = `STATUS: WATCHING_${data.directory}`;
            
            // Save to recent directories
            saveToRecentDirectories(data.directory);
        } else {
            currentDirDisplay.textContent = `STATUS: ERROR_${data.error}`;
            setTimeout(() => {
                currentDirDisplay.textContent = 'STATUS: PLEASE_TRY_ANOTHER_PATH';
            }, 3000);
        }
        
        // Clear the input field
        manualDirInput.value = '';
    })
    .catch(error => {
        console.error('Error setting directory:', error);
        currentDirDisplay.textContent = `STATUS: ERROR_${error.message}`;
        setTimeout(() => {
            currentDirDisplay.textContent = 'STATUS: PLEASE_TRY_ANOTHER_PATH';
        }, 3000);
    });
}

// Initialize the scene
function init() {
    // Set up camera position
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    
    // Log renderer state at initialization
    console.log("Renderer state at init:", {
        pixelRatio: renderer.getPixelRatio(),
        size: renderer.getSize(new THREE.Vector2()),
        domElement: {
            width: renderer.domElement.width,
            height: renderer.domElement.height,
            clientWidth: renderer.domElement.clientWidth,
            clientHeight: renderer.domElement.clientHeight,
            style: {
                width: renderer.domElement.style.width,
                height: renderer.domElement.style.height
            }
        },
        container: {
            width: canvasContainer.clientWidth,
            height: canvasContainer.clientHeight
        }
    });
    
    // Force renderer to use the correct size and pixel ratio
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    renderer.setSize(width, height, false); // false to avoid setting style
    renderer.setPixelRatio(Math.max(2, window.devicePixelRatio));
    
    // Ensure the renderer is properly sized
    resizeRenderer();
    
    // Add window resize listener
    window.addEventListener('resize', () => {
        resizeRenderer();
        
        // Update camera frustum size based on aspect ratio
        aspect = window.innerWidth / window.innerHeight;
        frustumSize = aspect < 1 ? 15 : 10;
        
        if (camera) {
            camera.left = frustumSize * aspect / -2;
            camera.right = frustumSize * aspect / 2;
            camera.top = frustumSize / 2;
            camera.bottom = frustumSize / -2;
            camera.updateProjectionMatrix();
        }
    });
    
    // Create the visualization
    createProgressRing();
    
    // Force an initial update to ensure particles are visible
    // This is a fallback in case the updateVisualization call in createProgressRing doesn't work
    setTimeout(() => {
        console.log("Forcing initial visualization update");
        updateVisualization(0, 100);
    }, 500);
    
    // Initialize settings panel
    initSettingsPanel();
    
    // Initialize editable frame counter
    initFrameCounter();
    
    // Start animation loop
    animate();
    
    // Fetch server info
    //fetchServerInfo();
    
    initScrollBehavior(); // Add this line to initialize scroll behavior
    
    // Set up continuous updates for time-based values
    setupContinuousUpdates();
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    controls.update();
    
    // Rotate the entire visualization container slightly
    if (visualContainer) {
        visualContainer.rotation.y += 0.002;
    
        // Animate particles and planets
        if (progressRing) {
            // Process both front and back halves
            progressRing.children.forEach(half => {
                half.children.forEach(child => {
                    // Handle particles
                    if (child.userData && child.userData.isParticle) {
                        // Animate all particles, not just visible ones
                        // Update orbit position with faster speed
                        child.userData.orbitAngle += child.userData.orbitSpeed;
                        
                        // Calculate orbit position with larger radius
                        const orbitX = Math.cos(child.userData.orbitAngle) * child.userData.orbitRadius;
                        const orbitZ = Math.sin(child.userData.orbitAngle) * child.userData.orbitRadius;
                        
                        // Base position on the ring
                        const baseX = Math.cos(child.userData.angle) * child.userData.baseRadius;
                        const baseZ = Math.sin(child.userData.angle) * child.userData.baseRadius;
                        
                        // Combined position (base + orbit)
                        child.position.x = baseX + orbitX;
                        child.position.z = baseZ + orbitZ;
                        
                        // Oscillate y position more dramatically
                        child.position.y += child.userData.ySpeed * child.userData.yDirection;
                        if (Math.abs(child.position.y) > child.userData.yRange) {
                            child.userData.yDirection *= -1;
                        }
                        
                        // Pulse opacity for additional effect, but ensure minimum visibility
                        const time = Date.now() * 0.001;
                        const baseOpacity = child.material.opacity;
                        // More dramatic pulsing but with a minimum opacity
                        const newOpacity = baseOpacity * (0.7 + Math.sin(time * 2 + child.userData.angle) * 0.3);
                        child.material.opacity = Math.max(newOpacity, 0.4); // Ensure minimum opacity
                        
                        // Also pulse size slightly
                        const baseSize = child.scale.x;
                        child.scale.setScalar(baseSize * (0.9 + Math.sin(time * 3 + child.userData.orbitAngle) * 0.1));
                    }
                    
                    // Handle planets
                    if (child.userData && child.userData.isPlanet) {
                        // Update orbit angle
                        child.userData.orbitAngle += child.userData.orbitSpeed;
                        
                        // Update position
                        child.position.x = Math.cos(child.userData.orbitAngle) * child.userData.orbitDistance;
                        child.position.z = Math.sin(child.userData.orbitAngle) * child.userData.orbitDistance;
                        
                        // Add slight bobbing motion
                        child.position.y = Math.sin(Date.now() * 0.001 + child.userData.orbitAngle) * 0.1;
                        
                        // Rotate the planet itself
                        child.rotation.y += 0.01;
                        child.rotation.x += 0.005;
                        
                        // Determine if this planet should be visible based on its angle
                        // Only show planets in the correct half
                        const normalizedAngle = ((child.userData.orbitAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                        const isFrontHalf = (normalizedAngle >= Math.PI * 1.5 || normalizedAngle <= Math.PI * 0.5);
                        
                        // Show/hide based on whether it's in the correct half
                        if ((isFrontHalf && child.userData.isFront) || (!isFrontHalf && !child.userData.isFront)) {
                            child.visible = true;
                        } else {
                            child.visible = false;
                        }
                    }
                });
            });
        }
        
        // Log animation status very rarely (once every ~1000 frames)
        if (Math.random() < 0.001) { 
            // Removed console.log for animation running
            // Removed console.log for progress ring exists
        }
    }
    
    // Render the scene
    renderer.render(scene, camera);
}

// Initialize settings panel
function initSettingsPanel() {
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    
    settingsToggle.addEventListener('click', () => {
        settingsPanel.classList.add('open');
    });
    
    settingsClose.addEventListener('click', () => {
        settingsPanel.classList.remove('open');
    });
    
    // Add drag and drop functionality to the directory input
    const dirInput = document.getElementById('manualDirPath');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dirInput.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dirInput.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dirInput.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dirInput.classList.add('highlight');
    }
    
    function unhighlight() {
        dirInput.classList.remove('highlight');
    }
    
    // Handle dropped files/folders
    dirInput.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            // Get the path from the first dropped item
            const path = files[0].path;
            if (path) {
                dirInput.value = path;
                // Trigger the set directory action
                setDirButton.click();
            }
        }
    }
}

// Modify the WebSocket message handler to use the animation
// Remove this redeclaration of socket

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Connecting to WebSocket at ${wsUrl}`);
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = function() {
        console.log('WebSocket connection established');
        
        // Immediately request current state when connection is established
        requestCurrentState();
    };
    
    socket.onmessage = handleWebSocketMessage;
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
    
    socket.onclose = function() {
        console.log('WebSocket connection closed');
        
        // Try to reconnect after a delay
        setTimeout(function() {
            console.log('Attempting to reconnect WebSocket...');
            initWebSocket();
        }, 3000);
    };
    
    return socket;
}

// Initialize WebSocket connection when the page loads
initWebSocket();

// Get server info
const serverInfoElement = document.getElementById('serverInfo');

function fetchServerInfo() {
    fetch('/api/server-info')
        .then(response => response.json())
        .then(data => {
            const serverInfoText = `SERVER_ROOT: ${data.cwd}\nPLATFORM: ${data.platform}\nDEFAULT_DIR: ${data.defaultWatchDir}`;
            serverInfoElement.textContent = serverInfoText;
        })
        .catch(error => {
            console.error('Error fetching server info:', error);
            serverInfoElement.textContent = 'ERROR_FETCHING_SERVER_INFO';
        });
}

// Fetch server info on page load
fetchServerInfo();

// Function to set total frames via WebSocket
function setTotalFramesViaWebSocket(totalFrames) {
    if (!totalFrames || isNaN(parseInt(totalFrames))) {
        console.error('Invalid total frames value:', totalFrames);
        return false;
    }
    
    const numFrames = parseInt(totalFrames);
    if (numFrames <= 0) {
        console.error('Total frames must be greater than 0');
        return false;
    }
    
    // Send the total frames to the server via WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'setTotalFrames',
            totalFrames: numFrames
        }));
        console.log('Sent total frames to server:', numFrames);
        return true;
    } else {
        console.error('WebSocket not connected, cannot set total frames');
        return false;
    }
}

// Update progress bar
function updateProgressBar(percentage) {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        // Ensure percentage is a valid number between 0 and 100
        const validPercentage = Math.max(0, Math.min(100, Number(percentage) || 0));
        progressFill.style.width = `${validPercentage}%`;
        
        // Occasionally log progress bar updates
        if (Math.random() < 0.1) {
            console.log(`Progress bar updated: ${validPercentage.toFixed(1)}%`);
        }
    }
}

// Initialize collapsible cards
function initCollapsibleCards() {
    const cardHeaders = document.querySelectorAll('.card-header');
    
    cardHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.getAttribute('data-target');
            const content = document.getElementById(targetId);
            const icon = header.querySelector('.toggle-icon');
            
            // Toggle the collapsed class
            content.classList.toggle('collapsed');
            icon.classList.toggle('collapsed');
        });
    });
}

// Call after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCollapsibleCards();
    init(); // Initialize the 3D scene
});

// Make frame counter editable
function initFrameCounter() {
    // Try to get the frame counter element with the correct ID
    frameCounter = document.querySelector('.frame-counter-number');
    if (!frameCounter) {
        console.warn('Frame counter element not found');
        return;
    }
    
    frameCounter.addEventListener('click', () => {
        const currentText = frameCounter.textContent;
        const [current, total] = currentText.split('/').map(num => parseInt(num, 10) || 0);
        
        // Get theme colors
        const colors = getComputedStyle(document.documentElement);
        const bgColor = colors.getPropertyValue('--color-surface').trim() || '#1a1e2e';
        const textColor = colors.getPropertyValue('--color-text').trim() || '#f0f2f5';
        const accentColor = colors.getPropertyValue('--color-accent').trim() || '#f0b040';
        
        // Create a modal container
        const modalContainer = document.createElement('div');
        modalContainer.style.position = 'fixed';
        modalContainer.style.top = '50%';
        modalContainer.style.left = '50%';
        modalContainer.style.transform = 'translate(-50%, -50%)';
        modalContainer.style.zIndex = '9999';
        modalContainer.style.background = bgColor;
        modalContainer.style.padding = '20px';
        modalContainer.style.borderRadius = '10px';
        modalContainer.style.border = `2px solid ${accentColor}`;
        modalContainer.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.8)';
        
        // Create a label
        const label = document.createElement('div');
        label.textContent = 'Edit Total Frames:';
        label.style.color = textColor;
        label.style.marginBottom = '10px';
        label.style.fontFamily = "'Space Mono', monospace";
        label.style.fontSize = '1.5rem';
        label.style.textAlign = 'center';
        
        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = total || 0;
        input.style.background = bgColor;
        input.style.color = textColor;
        input.style.border = `2px solid ${accentColor}`;
        input.style.borderRadius = '4px';
        input.style.padding = '0.5rem';
        input.style.fontSize = '2rem';
        input.style.fontWeight = 'bold';
        input.style.width = '200px';
        input.style.textAlign = 'center';
        input.style.fontFamily = "'Space Mono', monospace";
        input.style.display = 'block';
        input.style.margin = '0 auto';
        
        // Create buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.marginTop = '15px';
        buttonContainer.style.gap = '10px';
        
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.style.background = accentColor;
        saveButton.style.color = '#000000';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '4px';
        saveButton.style.padding = '8px 15px';
        saveButton.style.cursor = 'pointer';
        saveButton.style.fontFamily = "'Space Mono', monospace";
        saveButton.style.fontWeight = 'bold';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.background = 'rgba(255, 255, 255, 0.1)';
        cancelButton.style.color = textColor;
        cancelButton.style.border = 'none';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.padding = '8px 15px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontFamily = "'Space Mono', monospace";
        
        // Function to close the modal
        const closeModal = () => {
            if (document.body.contains(modalContainer)) {
                document.body.removeChild(modalContainer);
            }
        };
        
        // Add event listeners
        saveButton.addEventListener('click', () => {
            const newTotal = parseInt(input.value, 10) || total;
            frameCounter.textContent = `${current}/${newTotal}`;
            setTotalFramesViaWebSocket(newTotal);
            closeModal();
        });
        
        cancelButton.addEventListener('click', () => {
            closeModal();
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveButton.click();
            } else if (e.key === 'Escape') {
                cancelButton.click();
            }
        });
        
        // Close modal when clicking outside
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) {
                closeModal();
            }
        });
        
        // Assemble the container
        buttonContainer.appendChild(saveButton);
        buttonContainer.appendChild(cancelButton);
        modalContainer.appendChild(label);
        modalContainer.appendChild(input);
        modalContainer.appendChild(buttonContainer);
        
        // Add to body
        document.body.appendChild(modalContainer);
        
        // Focus the input
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    });
}

// Helper function to format time in a human-readable way
function formatTime(seconds) {
    // Return 'N/A' for undefined, null, Infinity, or NaN
    if (seconds === undefined || seconds === null || !isFinite(seconds) || isNaN(seconds)) {
        return 'N/A';
    }
    
    // Convert to number and handle negative values
    seconds = Number(seconds);
    if (seconds < 0) {
        return 'N/A';
    }
    
    // Format the time
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = '';
    
    if (hours > 0) {
        result += `${hours}h `;
    }
    
    if (minutes > 0 || hours > 0) {
        result += `${minutes}m `;
    }
    
    result += `${secs}s`;
    
    return result;
}

// Initialize scroll behavior and panel toggle
function initScrollBehavior() {
    const panelContainer = document.querySelector('.panel-container');
    const panel = document.querySelector('.panel');
    const toggleButton = document.getElementById('panel-toggle');
    
    if (!panel || !toggleButton || !panelContainer) {
        console.error('Panel, container, or toggle button not found');
        return;
    }
    
    function showPanel() {
        panelContainer.classList.remove('hidden');
        toggleButton.textContent = 'Hide';
    }
    
    function hidePanel() {
        panelContainer.classList.add('hidden');
        toggleButton.textContent = 'Info';
    }
    
    toggleButton.addEventListener('click', () => {
        if (panelContainer.classList.contains('hidden')) {
            showPanel();
        } else {
            hidePanel();
        }
    });
    
    // Initialize panel as hidden
    hidePanel();
}

// Function to create a "pop" effect with particles when animation completes
function popParticles(frameNumber) {
    if (!progressRing) return;
    
    // Check if we've already emitted particles for this frame
    if (frameNumber && frameNumber === lastParticleEmissionFrame) {
        console.log('PARTICLE_DEBUG - Skipping emission for already processed frame:', frameNumber);
        return;
    }
    
    // Check if we're within the cooldown period
    const currentTime = Date.now();
    console.log('PARTICLE_DEBUG - Attempting to emit particles:', {
        currentTime,
        lastEmissionTime: lastParticleEmissionTime,
        timeSinceLastEmission: (currentTime - lastParticleEmissionTime) / 1000,
        cooldownPeriod: PARTICLE_EMISSION_COOLDOWN / 1000,
        withinCooldown: (currentTime - lastParticleEmissionTime < PARTICLE_EMISSION_COOLDOWN),
        frameNumber,
        lastParticleEmissionFrame
    });
    
    if (currentTime - lastParticleEmissionTime < PARTICLE_EMISSION_COOLDOWN) {
        console.log('Skipping particle emission due to cooldown - last emission was', 
                   (currentTime - lastParticleEmissionTime) / 1000, 'seconds ago');
        return;
    }
    
    // Update the last emission time and frame
    lastParticleEmissionTime = currentTime;
    if (frameNumber) {
        lastParticleEmissionFrame = frameNumber;
    }
    
    console.log('Popping particles at:', new Date().toISOString(), 'for frame:', frameNumber);
    
    // Find all particles in the progress ring
    let particleCount = 0;
    progressRing.children.forEach(half => {
        half.children.forEach(child => {
            if (child.userData && child.userData.isParticle) {
                particleCount++;
                // Create a temporary animation for this particle
                const originalScale = child.scale.x;
                const originalOpacity = child.material.opacity;
                
                // Increase scale and opacity temporarily
                child.scale.setScalar(originalScale * 1.5);
                child.material.opacity = Math.min(originalOpacity * 1.5, 1.0);
                
                // Reset after a longer delay
                setTimeout(() => {
                    child.scale.setScalar(originalScale);
                    child.material.opacity = originalOpacity;
                }, 800 + Math.random() * 400); // Longer animation (800-1200ms)
            }
        });
    });
    
    console.log(`Animated ${particleCount} particles`);
}

function animateProgressFilling(oldCompletionRatio, newCompletionRatio, duration = 3000, framesChanged = false) {
    // Skip animation if values are the same
    if (oldCompletionRatio === newCompletionRatio) {
        return;
    }
    
    // Log animation start (commented out to reduce noise)
    // console.log('ANIMATION_DEBUG - Starting animation:', {
    //     oldCompletionRatio: oldCompletionRatio.toFixed(3),
    //     newCompletionRatio: newCompletionRatio.toFixed(3),
    //     duration,
    //     framesChanged,
    //     manualTotalFrames: window.manualTotalFrames,
    //     timestamp: new Date().toISOString()
    // });
    
    // Create easing functions library
    const easing = {
        // Exponential ease out
        expoEaseOut: function(t) {
            return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        },
        // Elastic ease out
        elasticEaseOut: function(t) {
            const p = 0.3;
            return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
        },
        // Bounce ease out
        bounceEaseOut: function(t) {
            if (t < 1 / 2.75) {
                return 7.5625 * t * t;
            } else if (t < 2 / 2.75) {
                return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
            } else if (t < 2.5 / 2.75) {
                return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
            } else {
                return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
            }
        },
        // Cubic ease in-out for smoother transitions
        cubicEaseInOut: function(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        },
        // Sine ease in-out for very smooth transitions
        sineEaseInOut: function(t) {
            return -(Math.cos(Math.PI * t) - 1) / 2;
        }
    };
    
    // Choose easing function based on the magnitude of change
    const change = Math.abs(newCompletionRatio - oldCompletionRatio);
    let easingFunction;
    
    if (change > 0.3) {
        // Large change - use sine easing for very smooth effect
        easingFunction = easing.sineEaseInOut;
    } else if (change > 0.1) {
        // Medium change - use cubic easing for smooth effect
        easingFunction = easing.cubicEaseInOut;
    } else {
        // Small change - use expo for quick, smooth effect
        easingFunction = easing.expoEaseOut;
    }
    
    // Only emit particles if frames actually changed, not just on ratio changes
    const shouldEmitParticles = framesChanged;
    
    // console.log('ANIMATION_DEBUG - Change analysis:', {
    //     change: change.toFixed(3),
    //     framesChanged,
    //     shouldEmitParticles,
    //     easingFunction: change > 0.3 ? 'sineEaseInOut' : (change > 0.1 ? 'cubicEaseInOut' : 'expoEaseOut')
    // });
    
    // Flag to ensure particles are only emitted once
    let particlesEmitted = false;
    
    // Animation variables
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    // Get the effective total frames
    const effectiveTotalFrames = window.manualTotalFrames || totalFrames;
    
    // Store the original completed frames for reference
    const originalCompletedFrames = completedFrames;
    
    // Calculate target completed frames
    const targetCompletedFrames = Math.round(newCompletionRatio * effectiveTotalFrames);
    
    // Determine the animation path
    // We want to animate in a clockwise direction around the circle
    let animationStartRatio, animationEndRatio;
    
    // If we're going backwards (e.g., from 70% to 30%), we need to animate through 0%/100%
    if (newCompletionRatio < oldCompletionRatio) {
        // Going backwards - animate from old ratio to 100%, then from 0% to new ratio
        // This creates a continuous clockwise motion
        
        // First phase: animate from old ratio to 1.0 (100%)
        animationStartRatio = oldCompletionRatio;
        animationEndRatio = 1.0;
        
        // Calculate how much of the duration should be spent on each phase
        const totalDistance = (1.0 - oldCompletionRatio) + newCompletionRatio;
        const phase1Duration = duration * ((1.0 - oldCompletionRatio) / totalDistance);
        const phase2Duration = duration - phase1Duration;
        
        console.log('ANIMATION_DEBUG - Backwards animation path:', {
            phase1: `${(oldCompletionRatio * 100).toFixed(1)}% → 100%`,
            phase2: `0% → ${(newCompletionRatio * 100).toFixed(1)}%`,
            phase1Duration,
            phase2Duration
        });
        
        // Phase 1 animation function
        const animatePhase1 = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / phase1Duration, 1);
            
            // Apply easing
            const easedProgress = easingFunction(progress);
            
            // Calculate current completion ratio for phase 1
            const currentRatio = animationStartRatio + (animationEndRatio - animationStartRatio) * easedProgress;
            
            // Calculate the frame count based on the ratio
            const currentFrameCount = Math.round(currentRatio * effectiveTotalFrames);
            
            // Update visualization - use more frequent updates for smoother animation
            updateVisualization(currentFrameCount, effectiveTotalFrames);
            
            // Update progress bar
            updateProgressBar(currentRatio * 100);
            
            // Continue animation if phase 1 is not complete
            if (progress < 1) {
                requestAnimationFrame(animatePhase1);
            } else {
                // Phase 1 complete, start phase 2
                const phase2StartTime = Date.now();
                
                // Phase 2 animation function (from 0% to new ratio)
                const animatePhase2 = () => {
                    const now = Date.now();
                    const elapsed = now - phase2StartTime;
                    const progress = Math.min(elapsed / phase2Duration, 1);
                    
                    // Apply easing
                    const easedProgress = easingFunction(progress);
                    
                    // Calculate current completion ratio for phase 2
                    const currentRatio = 0 + (newCompletionRatio - 0) * easedProgress;
                    
                    // Calculate the frame count based on the ratio
                    const currentFrameCount = Math.round(currentRatio * effectiveTotalFrames);
                    
                    // Update visualization - use more frequent updates for smoother animation
                    updateVisualization(currentFrameCount, effectiveTotalFrames);
                    
                    // Update progress bar
                    updateProgressBar(currentRatio * 100);
                    
                    // Continue animation if phase 2 is not complete
                    if (progress < 1) {
                        requestAnimationFrame(animatePhase2);
                    } else {
                        // Animation complete - trigger particle effect only if frames actually changed
                        // and only if particles haven't been emitted yet
                        if (shouldEmitParticles && !particlesEmitted) {
                            console.log('ANIMATION_DEBUG - Animation complete, emitting particles:', {
                                timestamp: new Date().toISOString(),
                                framesChanged,
                                shouldEmitParticles,
                                particlesEmitted,
                                finalFrameCount: targetCompletedFrames
                            });
                            particlesEmitted = true;
                            popParticles(targetCompletedFrames);
                        } else {
                            console.log('ANIMATION_DEBUG - Animation complete, NOT emitting particles:', {
                                timestamp: new Date().toISOString(),
                                framesChanged,
                                shouldEmitParticles,
                                particlesEmitted,
                                finalFrameCount: targetCompletedFrames
                            });
                        }
                        
                        // Ensure final state is shown with the correct target frame count
                        updateVisualization(targetCompletedFrames, effectiveTotalFrames);
                        
                        // Restore the actual completed frames count
                        completedFrames = targetCompletedFrames;
                    }
                };
                
                // Start phase 2 animation
                animatePhase2();
            }
        };
        
        // Start phase 1 animation
        animatePhase1();
    } else {
        // Going forwards - simple animation from old ratio to new ratio
        animationStartRatio = oldCompletionRatio;
        animationEndRatio = newCompletionRatio;
        
        // console.log('ANIMATION_DEBUG - Forward animation path:', {
        //     path: `${(oldCompletionRatio * 100).toFixed(1)}% → ${(newCompletionRatio * 100).toFixed(1)}%`,
        //     duration
        // });
        
        // Animation function for forward motion
        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Apply easing
            const easedProgress = easingFunction(progress);
            
            // Calculate current completion ratio
            const currentRatio = animationStartRatio + (animationEndRatio - animationStartRatio) * easedProgress;
            
            // Calculate the frame count based on the ratio
            const currentFrameCount = Math.round(currentRatio * effectiveTotalFrames);
            
            // Update visualization - always update for smoother animation
            updateVisualization(currentFrameCount, effectiveTotalFrames);
            
            // Update progress bar
            updateProgressBar(currentRatio * 100);
            
            // Continue animation if not complete
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Ensure final state is shown with the correct target frame count
                updateVisualization(targetCompletedFrames, effectiveTotalFrames);
                
                // Restore the actual completed frames count
                completedFrames = targetCompletedFrames;
                
                // Animation complete - trigger particle effect only if frames actually changed
                // and only if particles haven't been emitted yet
                if (shouldEmitParticles && !particlesEmitted) {
                    console.log('ANIMATION_DEBUG - Animation complete, emitting particles:', {
                        timestamp: new Date().toISOString(),
                        framesChanged,
                        shouldEmitParticles,
                        particlesEmitted,
                        finalFrameCount: targetCompletedFrames
                    });
                    particlesEmitted = true;
                    popParticles(targetCompletedFrames);
                } else {
                    console.log('ANIMATION_DEBUG - Animation complete, NOT emitting particles:', {
                        timestamp: new Date().toISOString(),
                        framesChanged,
                        shouldEmitParticles,
                        particlesEmitted,
                        finalFrameCount: targetCompletedFrames
                    });
                }
            }
        };
        
        // Start forward animation
        animate();
    }
}

// Add particles to the ring
function addParticles(frontHalf, backHalf, count = 30) {
    const colors = getThemeColors();
    
    // Create bright, high-contrast colors for particles
    const brightAccent = new THREE.Color(colors.accent).multiplyScalar(1.5);
    const brightPrimary = new THREE.Color(colors.primary).multiplyScalar(1.5);
    
    // Add particles distributed around the ring
    for (let i = 0; i < count; i++) {
        // Random angle around the ring
        const angle = Math.random() * Math.PI * 2;
        
        // Create particle geometry and material
        const particleGeometry = new THREE.SphereGeometry(0.03, 8, 6);
        const particleMaterial = new THREE.MeshBasicMaterial({
            color: colors.accent,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        // Create particle
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Base position on the ring
        const baseRadius = ringRadius + (Math.random() * 0.8 - 0.4); // Vary slightly from ring radius
        const baseX = Math.cos(angle) * baseRadius;
        const baseZ = Math.sin(angle) * baseRadius;
        
        // Initial position with some randomness
        particle.position.set(
            baseX + (Math.random() * 0.4 - 0.2),
            (Math.random() * 0.4 - 0.2),
            baseZ + (Math.random() * 0.4 - 0.2)
        );
        
        // Store particle data for animation
        particle.userData = {
            angle: angle,
            baseRadius: baseRadius,
            orbitAngle: Math.random() * Math.PI * 2,
            orbitRadius: 0.2 + Math.random() * 0.3,
            orbitSpeed: 0.03 + Math.random() * 0.05, // Increased from 0.01-0.02 to 0.03-0.08
            ySpeed: 0.002 + Math.random() * 0.003,
            yDirection: Math.random() > 0.5 ? 1 : -1,
            yRange: 0.1 + Math.random() * 0.2,
            isParticle: true,
            baseSize: 1.0
        };
        
        // Determine which half to add to based on angle
        // Front half: 270° to 90° (or -90° to 90°)
        // Back half: 90° to 270°
        const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const isFrontHalf = (normalizedAngle >= Math.PI * 1.5 || normalizedAngle <= Math.PI * 0.5);
        
        if (isFrontHalf) {
            frontHalf.add(particle);
        } else {
            backHalf.add(particle);
        }
    }
    
    console.log(`Added ${count} particles to the visualization`);
}

// Function to update the stats panel with accurate information
function updateStatsPanel(data) {
    // Store timestamps for continuous updates
    if (data.firstFrameTimestamp) firstFrameTimestamp = data.firstFrameTimestamp;
    if (data.lastFrameTimestamp) lastFrameTimestamp = data.lastFrameTimestamp;
    if (data.previousFrameTimestamp) previousFrameTimestamp = data.previousFrameTimestamp;
    
    // Calculate time difference between server and client
    if (data.serverTimestamp) {
        serverClientTimeDiff = data.serverTimestamp - Date.now();
    }
    
    // Calculate all time-based values on the client side
    const now = Date.now();
    
    // Time elapsed since first frame
    const timeElapsed = firstFrameTimestamp ? (now - firstFrameTimestamp + serverClientTimeDiff) / 1000 : 0;
    
    // Time since last frame was completed (current frame time)
    const timeSinceLastFrame = lastFrameTimestamp ? (now - lastFrameTimestamp + serverClientTimeDiff) / 1000 : 0;
    
    // Last frame time (time between the last two frames)
    const lastFrameTime = (lastFrameTimestamp && previousFrameTimestamp) 
        ? (lastFrameTimestamp - previousFrameTimestamp) / 1000 
        : 0;
    
    // Average frame time
    const avgFrameTime = (data.completedFrames > 1 && firstFrameTimestamp && lastFrameTimestamp)
        ? (lastFrameTimestamp - firstFrameTimestamp) / 1000 / (data.completedFrames - 1)
        : lastFrameTime || 0;
    
    // Calculate ETA
    let eta = null;
    if (avgFrameTime > 0 && data.completedFrames < data.totalFrames) {
        eta = avgFrameTime * (data.totalFrames - data.completedFrames);
    }
    
    // Update percentage
    const percentageElement = document.getElementById('percentage');
    if (percentageElement) {
        percentageElement.textContent = `${data.percentage.toFixed(1)}%`;
    }
    
    // Update time elapsed
    const timeElapsedElement = document.getElementById('timeElapsed');
    if (timeElapsedElement) {
        timeElapsedElement.textContent = formatTime(timeElapsed);
    }
    
    // Update ETA - only show N/A if we don't have an average frame time or if rendering is complete
    const etaElement = document.getElementById('eta');
    if (etaElement) {
        etaElement.textContent = eta !== null ? formatTime(eta) : 'N/A';
    }
    
    // Update last frame time
    const lastFrameTimeElement = document.getElementById('lastFrameTime');
    if (lastFrameTimeElement) {
        lastFrameTimeElement.textContent = formatTime(lastFrameTime);
    }
    
    // Update average frame time
    const avgFrameTimeElement = document.getElementById('avgFrameTime');
    if (avgFrameTimeElement) {
        avgFrameTimeElement.textContent = formatTime(avgFrameTime);
    }
    
    // Update current frame time (time since last frame was completed)
    const currentFrameTimeElement = document.getElementById('currentFrameTime');
    if (currentFrameTimeElement) {
        currentFrameTimeElement.textContent = formatTime(timeSinceLastFrame);
        
        // Reset classes
        currentFrameTimeElement.classList.remove('current-frame-normal', 'current-frame-warning', 'current-frame-alert');
        
        // Set color based on comparison with average and last frame times
        if (timeSinceLastFrame > 0 && avgFrameTime > 0) {
            // Calculate thresholds for warning and alert states
            const warningThreshold = Math.max(avgFrameTime * 1.5, lastFrameTime * 1.5);
            const alertThreshold = Math.max(avgFrameTime * 3, lastFrameTime * 3);
            
            if (timeSinceLastFrame > alertThreshold) {
                currentFrameTimeElement.classList.add('current-frame-alert');
            } else if (timeSinceLastFrame > warningThreshold) {
                currentFrameTimeElement.classList.add('current-frame-warning');
            } else {
                currentFrameTimeElement.classList.add('current-frame-normal');
            }
        } else {
            currentFrameTimeElement.classList.add('current-frame-normal');
        }
    }
    
    // Update frame counter
    const frameCounterElement = document.getElementById('frame-counter');
    if (frameCounterElement) {
        frameCounterElement.textContent = `${data.completedFrames}/${data.totalFrames}`;
    }
    
    // Update progress bar
    updateProgressBar(data.percentage);
    
    // Update visualization
    updateVisualization(data.completedFrames, data.totalFrames);
}

// Set up a timer to continuously update time-based values
function setupContinuousUpdates() {
    // Update every 100ms for smooth time display
    setInterval(() => {
        if (lastFrameTimestamp > 0) {
            // Only update if we have received data from the server
            const now = Date.now();
            
            // Time since last frame was completed (current frame time)
            const timeSinceLastFrame = (now - lastFrameTimestamp + serverClientTimeDiff) / 1000;
            
            // Update current frame time display
            const currentFrameTimeElement = document.getElementById('currentFrameTime');
            if (currentFrameTimeElement) {
                currentFrameTimeElement.textContent = formatTime(timeSinceLastFrame);
                
                // Calculate thresholds for warning and alert states
                const lastFrameTime = (lastFrameTimestamp && previousFrameTimestamp) 
                    ? (lastFrameTimestamp - previousFrameTimestamp) / 1000 
                    : 0;
                
                const avgFrameTime = (completedFrames > 1 && firstFrameTimestamp && lastFrameTimestamp)
                    ? (lastFrameTimestamp - firstFrameTimestamp) / 1000 / (completedFrames - 1)
                    : lastFrameTime || 0;
                
                const warningThreshold = Math.max(avgFrameTime * 1.5, lastFrameTime * 1.5);
                const alertThreshold = Math.max(avgFrameTime * 3, lastFrameTime * 3);
                
                // Reset classes
                currentFrameTimeElement.classList.remove('current-frame-normal', 'current-frame-warning', 'current-frame-alert');
                
                // Set color based on thresholds
                if (timeSinceLastFrame > alertThreshold) {
                    currentFrameTimeElement.classList.add('current-frame-alert');
                } else if (timeSinceLastFrame > warningThreshold) {
                    currentFrameTimeElement.classList.add('current-frame-warning');
                } else {
                    currentFrameTimeElement.classList.add('current-frame-normal');
                }
            }
            
            // Update elapsed time display
            if (firstFrameTimestamp > 0) {
                const timeElapsed = (now - firstFrameTimestamp + serverClientTimeDiff) / 1000;
                const timeElapsedElement = document.getElementById('timeElapsed');
                if (timeElapsedElement) {
                    timeElapsedElement.textContent = formatTime(timeElapsed);
                }
            }
        }
    }, 100);
}

// Connect to WebSocket server
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log(`Connecting to WebSocket at ${wsUrl}`);
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = function() {
        console.log('WebSocket connection established');
    };
    
    socket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data);
            
            if (data.type === 'update') {
                // Update the frame counter
                const frameCounterEl = document.getElementById('frame-counter');
                if (frameCounterEl) {
                    frameCounterEl.textContent = `${data.completedFrames}/${data.totalFrames}`;
                }
                
                // Update the frame counter label to include percentage
                const frameCounterLabelEl = document.querySelector('.frame-counter-label');
                if (frameCounterLabelEl) {
                    const percentage = Math.round(data.percentage);
                    frameCounterLabelEl.textContent = `${percentage}% FRAMES RENDERED`;
                }
                
                // Update the stats panel
                updateStatsPanel(data);
                
                // Update progress bar
                updateProgressBar(data.percentage);
                
                // Update visualization
                updateVisualization(data.completedFrames, data.totalFrames);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };
    
    socket.onclose = function() {
        console.log('WebSocket connection closed. Reconnecting in 5 seconds...');
        setTimeout(connectWebSocket, 5000);
    };
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing application');
    
    // Set theme colors
    generateColorPalette();
    
    // Initialize the canvas
    init();
    
    // Initialize the scroll behavior
    initScrollBehavior();
    
    // Initialize the frame counter click handler
    initFrameCounter();
    
    // Connect to WebSocket server
    connectWebSocket();
    
    // Initialize with some default values
    updateStatsPanel({
        completedFrames: 0,
        totalFrames: 100,
        timeElapsed: 0,
        eta: 0,
        lastFrameTime: 0,
        avgFrameTime: 0
    });
    
    // Initialize progress bar
    updateProgressBar(0);
    
    // Initialize visualization
    createProgressRing();
    updateVisualization(0, 120);
});

// Function to handle WebSocket messages with reduced logging
function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'update' || data.type === 'initialState') {
            // Log the data occasionally to avoid console spam
            if (Math.random() < 0.05 || data.type === 'initialState') {
                console.log(`Received ${data.type}:`, data);
            }
            
            // Store current values for comparison in next update
            const oldCompletedFrames = completedFrames;
            const oldTotalFrames = totalFrames;
            
            // Update global variables
            completedFrames = data.completedFrames;
            totalFrames = data.totalFrames;
            
            // Update the stats panel with the data
            updateStatsPanel(data);
            
            // If frames have changed, animate the progress filling
            if (oldCompletedFrames !== data.completedFrames) {
                const oldRatio = oldCompletedFrames / oldTotalFrames;
                const newRatio = data.completedFrames / data.totalFrames;
                
                // Only animate if there's a significant change
                if (Math.abs(newRatio - oldRatio) > 0.001) {
                    animateProgressFilling(oldRatio, newRatio, 1000, true);
                }
                
                // Pop particles for each new frame
                for (let i = oldCompletedFrames + 1; i <= data.completedFrames; i++) {
                    popParticles(i);
                }
            }
        } else if (data.type === 'serverInfo') {
            // Handle server info message
            console.log('Received server info:', data);
            
            // Update server info display
            const serverInfoElement = document.getElementById('serverInfo');
            if (serverInfoElement) {
                serverInfoElement.innerHTML = `
                    <div>Server Version: ${data.version || 'Unknown'}</div>
                    <div>Node.js: ${data.nodeVersion || 'Unknown'}</div>
                    <div>Platform: ${data.platform || 'Unknown'}</div>
                `;
            }
            
            // Update current directory display
            const currentDirElement = document.getElementById('currentDir');
            if (currentDirElement && data.watchDir) {
                currentDirElement.textContent = `Watching: ${data.watchDir}`;
            }
        }
    } catch (error) {
        console.error('Error handling WebSocket message:', error);
    }
}

// Function to request the current state from the server
function requestCurrentState() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Requesting current state from server');
        socket.send(JSON.stringify({
            type: 'requestState'
        }));
    } else {
        console.warn('Cannot request state: WebSocket not connected');
    }
}