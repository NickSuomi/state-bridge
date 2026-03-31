import http from 'node:http';

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>State Bridge Fixture</title>
    <style>
      body { font-family: sans-serif; padding: 24px; }
      code { font-family: monospace; }
    </style>
  </head>
  <body>
    <h1 id="page-label"></h1>
    <pre id="local-dump"></pre>
    <pre id="session-dump"></pre>
    <script>
      const pageLabel = document.getElementById('page-label');
      const localDump = document.getElementById('local-dump');
      const sessionDump = document.getElementById('session-dump');

      const pathname = window.location.pathname;
      pageLabel.textContent = pathname;

      function dump(storage) {
        const entries = {};
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key !== null) {
            entries[key] = storage.getItem(key);
          }
        }
        return JSON.stringify(entries, null, 2);
      }

      window.renderState = () => {
        localDump.textContent = dump(window.localStorage);
        sessionDump.textContent = dump(window.sessionStorage);
      };

      window.renderState();
    </script>
  </body>
</html>`;

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});

server.listen(4173, '0.0.0.0', () => {
  console.log('Fixture server listening on http://127.0.0.1:4173');
});
