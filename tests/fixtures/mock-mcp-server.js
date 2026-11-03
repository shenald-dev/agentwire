import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const req = JSON.parse(trimmed);
    const res = {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        content: [{ type: 'text', text: 'mock-output' }]
      }
    };
    process.stdout.write(JSON.stringify(res) + '\n');
  } catch {
    // Ignore invalid lines
  }
});
