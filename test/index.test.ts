import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isMainModule } from '../src/index.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('CLI entry point detection', () => {
  it('recognizes execution through an npm-style symbolic link', () => {
    const directory = mkdtempSync(join(tmpdir(), 'inha-library-mcp-'));
    temporaryDirectories.push(directory);

    const entryPoint = join(directory, 'dist', 'index.js');
    const binaryLink = join(directory, 'inha-library-availability-mcp');
    mkdirSync(join(directory, 'dist'));
    writeFileSync(entryPoint, '');
    symlinkSync(entryPoint, binaryLink);

    expect(isMainModule(pathToFileURL(entryPoint).href, binaryLink)).toBe(true);
  });
});
