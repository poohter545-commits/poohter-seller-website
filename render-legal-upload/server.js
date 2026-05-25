const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 10000;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const redirects = {
  '/': '/privacy-policy.html',
  '/privacy-policy': '/privacy-policy.html',
  '/delete-account': '/delete-account.html',
};

const server = http.createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const redirectTarget = redirects[rawPath];
  if (redirectTarget) {
    res.writeHead(302, { Location: redirectTarget });
    res.end();
    return;
  }

  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Poohter legal pages running on port ${port}`);
});
