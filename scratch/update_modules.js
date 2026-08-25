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
  const appModulePath = path.join(__dirname, '..', service, 'src', 'app.module.ts');
  if (!fs.existsSync(appModulePath)) {
    console.log(`Skipping ${service} - no app.module.ts`);
    continue;
  }

  let content = fs.readFileSync(appModulePath, 'utf8');

  // Skip if already has PrometheusModule
  if (content.includes('PrometheusModule')) {
    console.log(`Skipping ${service} - already has PrometheusModule`);
    continue;
  }

  // 1. Add imports
  const importsToAdd = `
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '@parakh/common';
`;
  
  // Find last import
  const importMatches = [...content.matchAll(/^import.*from.*$/gm)];
  const lastImport = importMatches[importMatches.length - 1];
  if (lastImport) {
    const insertIdx = lastImport.index + lastImport[0].length;
    content = content.slice(0, insertIdx) + '\n' + importsToAdd + content.slice(insertIdx);
  } else {
    content = importsToAdd + content;
  }

  // 2. Add PrometheusModule to @Module imports array
  content = content.replace(/imports:\s*\[/, 'imports: [\n    PrometheusModule.register(),');

  // 3. Add APP_INTERCEPTOR to @Module providers array
  if (content.includes('providers: [')) {
    content = content.replace(/providers:\s*\[/, 'providers: [\n    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },');
  } else {
    // Need to add providers array to @Module
    content = content.replace(/imports:\s*\[([\s\S]*?)\](,?)/, (match, importsStr, comma) => {
      return `imports: [${importsStr}],\n  providers: [\n    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },\n  ]${comma}`;
    });
  }

  fs.writeFileSync(appModulePath, content, 'utf8');
  console.log(`Updated ${service}/src/app.module.ts`);
}
