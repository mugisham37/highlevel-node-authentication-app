const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TypeScript files in the API
const files = glob.sync('apps/api/src/**/*.ts');

files.forEach(file => {
  try {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace logging imports
    const oldImportPattern = /from ['"]\.\.?\/.*?\/logging\/.*?['"]/g;
    const newImport = "from '@company/logger'";
    
    if (oldImportPattern.test(content)) {
      content = content.replace(oldImportPattern, newImport);
      fs.writeFileSync(file, content);
      console.log(`Updated imports in: ${file}`);
    }
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

console.log('Import update complete!');