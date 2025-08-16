// normalize-eol.js (sem dependências externas)
const { readdirSync, readFileSync, writeFileSync, statSync } = require('fs');
const { join, extname } = require('path');

function walk(dir) {
  const files = [];
  readdirSync(dir).forEach(file => {
    const fullPath = join(dir, file);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (['.js', '.ts'].includes(extname(fullPath))) {
      files.push(fullPath);
    }
  });
  return files;
}

const projectDir = __dirname;
const files = walk(projectDir);

files.forEach(file => {
  const content = readFileSync(file, 'utf-8').replace(/\r\n/g, '\n');
  writeFileSync(file, content);
});

console.log('✅ EOL normalizado para LF em todos os arquivos .js/.ts');
