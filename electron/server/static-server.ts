import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { lookup } from "mime-types";

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export function createStaticServer(rootDir: string, port: number = 0): Promise<{ server: any; port: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    console.log(`[StaticServer] Starting server with root: ${rootDir}`);
    
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        let filePath = req.url || '/';
        console.log(`[StaticServer] Request: ${filePath}`);
        
        // Remove query strings
        filePath = filePath.split('?')[0];
        
        // Handle trailing slash: redirect /path to /path/ for directories
        if (!filePath.endsWith('/') && !path.extname(filePath)) {
          // For routes without extensions, try adding trailing slash
          const pathWithSlash = filePath + '/';
          const fullPathWithSlash = path.join(rootDir, pathWithSlash, 'index.html');
          try {
            await readFile(fullPathWithSlash);
            // File exists, this is a directory route
            console.log(`[StaticServer] Redirecting to: ${pathWithSlash}`);
            filePath = pathWithSlash;
          } catch {
            // Not a directory, continue as is
          }
        }
        
        // Default to index.html for root or directories
        if (filePath === '/' || filePath.endsWith('/')) {
          filePath = path.join(filePath, 'index.html');
        }
        
        // Security: prevent directory traversal
        const fullPath = path.join(rootDir, filePath);
        console.log(`[StaticServer] Full path: ${fullPath}`);
        
        if (!fullPath.startsWith(rootDir)) {
          console.log(`[StaticServer] Forbidden: ${fullPath}`);
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        
        try {
          const data = await readFile(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const mimeType = MIME_TYPES[ext] || lookup(fullPath) || 'application/octet-stream';
          
          console.log(`[StaticServer] Serving: ${fullPath} (${mimeType})`);
          res.writeHead(200, { 
            'Content-Type': mimeType,
            'Cache-Control': 'no-cache'
          });
          res.end(data);
        } catch (error: any) {
          console.log(`[StaticServer] Error reading file: ${error.message}`);
          // If file not found, try to serve the appropriate route's index.html
          if (error.code === 'ENOENT') {
            // Extract the route path (e.g., /history/ from /history/something)
            const pathParts = filePath.split('/').filter(Boolean);
            
            // Try to serve index.html from the route directory
            let indexPath = path.join(rootDir, 'index.html');
            if (pathParts.length > 0 && !path.extname(filePath)) {
              // Try /route/index.html first
              const routeIndexPath = path.join(rootDir, pathParts[0], 'index.html');
              try {
                await readFile(routeIndexPath);
                indexPath = routeIndexPath;
                console.log(`[StaticServer] Serving route index: ${indexPath}`);
              } catch {
                // Fall back to root index.html
                console.log(`[StaticServer] Fallback to root index.html`);
              }
            } else {
              console.log(`[StaticServer] Fallback to root index.html`);
            }
            
            try {
              const indexData = await readFile(indexPath);
              res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
              });
              res.end(indexData);
            } catch {
              console.log(`[StaticServer] 404 Not Found: ${filePath}`);
              res.writeHead(404);
              res.end('Not Found');
            }
          } else {
            console.log(`[StaticServer] 404 Not Found: ${filePath}`);
            res.writeHead(404);
            res.end('Not Found');
          }
        }
      } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    
    server.on('error', reject);
    
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      
      resolve({
        server,
        port: actualPort,
        stop: () => {
          server.close();
        }
      });
    });
  });
}
