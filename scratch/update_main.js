const fs = require('fs');
const path = require('path');

const services = [
  'api-gateway',
  'alert-service',
  'backtest-service',
  'fundamentals-service',
  'indicator-service',
  'market-data-service',
  'setup-service',
  'user-service',
  'websocket-gateway'
];

for (const service of services) {
  const mainPath = path.join(__dirname, '..', service, 'src', 'main.ts');
  if (!fs.existsSync(mainPath)) {
    console.log(`Skipping ${service} - no main.ts`);
    continue;
  }

  let content = fs.readFileSync(mainPath, 'utf8');

  // Skip if already has initTracing
  if (content.includes('initTracing')) {
    console.log(`Skipping ${service} - already has initTracing`);
    continue;
  }

  const importToAdd = `import { initTracing } from '@parakh/common';\ninitTracing('${service}');\n\n`;
  content = importToAdd + content;

  fs.writeFileSync(mainPath, content, 'utf8');
  console.log(`Updated ${service}/src/main.ts`);
}
