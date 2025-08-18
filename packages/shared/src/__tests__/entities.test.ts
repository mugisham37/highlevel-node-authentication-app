import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('Entities', () => {
  it('should have all entity files', async () => {
    const entityFiles = [
      'account.ts',
      'permission.ts',
      'role.ts',
      'session.ts',
      'user.ts',
      'webhook.ts',
      'index.ts'
    ];

    for (const file of entityFiles) {
      const filePath = join(__dirname, '..', 'entities', file);
      try {
        await readFile(filePath);
      } catch (error) {
        throw new Error(`Entity file ${file} is missing`);
      }
    }
  });

  it('should export entities from index', async () => {
    const indexPath = join(__dirname, '..', 'entities', 'index.ts');
    const content = await readFile(indexPath, 'utf-8');
    
    expect(content).toContain('export');
  });
});