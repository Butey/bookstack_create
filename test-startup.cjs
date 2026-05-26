const { spawn } = require('child_process');
const fs = require('fs');

console.log("Starting server...");
const cp = spawn('npx', ['tsx', 'server/index.ts'], { stdio: 'pipe' });

let out = '';
cp.stdout.on('data', (d) => {
  out += d.toString();
  if (out.includes('Server running on')) {
    console.log("Server started successfully!");
    fs.writeFileSync('server_log.txt', out);
    cp.kill();
  }
});

cp.stderr.on('data', (d) => {
  out += d.toString();
  fs.writeFileSync('server_log.txt', out);
});

cp.on('close', (code) => {
  console.log("Process exited with code", code);
  fs.writeFileSync('server_log.txt', out + '\nExited with code: ' + code);
});

setTimeout(() => {
  console.log("Timeout reached, killing");
  cp.kill();
}, 5000);
