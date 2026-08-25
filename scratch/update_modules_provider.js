const fs = require('fs');
const path = require('path');
const glob = require('glob');

const files = glob.sync('*-service/src/app.module.ts').concat(glob.sync('*-gateway/src/app.module.ts'));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  if (content.includes('HttpRequestDurationProvider')) {
    return; // Already added
  }

  // Add HttpRequestDurationProvider to import
  content = content.replace(
    /import \{ MetricsInterceptor \} from '@parakh\/common';/g,
    "import { MetricsInterceptor, HttpRequestDurationProvider } from '@parakh/common';"
  );

  // If both were imported separately or something else
  content = content.replace(
    /import \{ (.*)MetricsInterceptor(.*) \} from '@parakh\/common';/g,
    (match, p1, p2) => {
      if (!match.includes('HttpRequestDurationProvider')) {
        return `import { ${p1}MetricsInterceptor, HttpRequestDurationProvider${p2} } from '@parakh/common';`;
      }
      return match;
    }
  );
  
  // Add HttpRequestDurationProvider to providers array BEFORE MetricsInterceptor
  content = content.replace(
    /\{\s*provide: APP_INTERCEPTOR,\s*useClass: MetricsInterceptor,\s*\}/g,
    "HttpRequestDurationProvider,\n    {\n      provide: APP_INTERCEPTOR,\n      useClass: MetricsInterceptor,\n    }"
  );

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
});
