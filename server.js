const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 8084;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(root, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(root, 'index.html'), (fallbackError, fallbackData) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': types['.html'] });
        res.end(fallbackData);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Poohter seller website running at http://localhost:${port}`);
});
