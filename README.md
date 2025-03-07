# Render Progress 3D Visualization

A minimal, elegant 3D visualization tool for monitoring render progress, accessible both locally and remotely.

## Project Structure
```
.
├── GUIDELINES.md           # Project guidelines and roadmap
├── README.md              # This file
├── server.js              # Main server file
├── .cursor-config         # Cursor IDE configuration
├── package.json           # Project dependencies
└── public/               # Static files
    ├── index.html        # Main HTML file
    └── app.js            # Frontend JavaScript
```

## Setup
1. Install dependencies:
```bash
npm install
```

2. Create render output directory:
```bash
mkdir render_output
```

3. Start the server:
```bash
npm start
```

## Usage
1. Access the visualization at `http://localhost:3000`
2. Place your render output files in the `render_output` directory
3. Watch the 3D visualization update in real-time

## Development
- The project follows guidelines in `GUIDELINES.md`
- Key features and priorities are tracked in the guidelines
- All major changes should align with the project roadmap

## Remote Deployment
For remote deployment on Glitch.com:
1. Create a new project
2. Upload all files
3. Set `WATCH_DIR` environment variable
4. The app will be automatically deployed

## Contributing
1. Read `GUIDELINES.md` before making changes
2. Follow the development guidelines
3. Update documentation as needed
4. Test thoroughly before committing 