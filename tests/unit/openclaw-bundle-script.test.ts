import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getBundleRootPackages, getBundledNestedDependencyRepairs } from '../../scripts/bundle-openclaw-lib.mjs';

describe('bundle openclaw script', () => {
  it('includes explicit runtime packages that KTClaw resolves from the OpenClaw context', () => {
    expect(getBundleRootPackages()).toEqual([
      'openclaw',
      '@larksuiteoapi/node-sdk',
    ]);
  });

  it('pins nested dependency repairs for packages that break under flat dependency hoisting', () => {
    expect(getBundledNestedDependencyRepairs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: 'hosted-git-info',
          dependencyName: 'lru-cache',
        }),
      ]),
    );
  });

  it('strips retired channel extension bundles from the packaged openclaw payload', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/bundle-openclaw.mjs'), 'utf8');

    expect(source).toContain("'node_modules/@node-llama-cpp'");
    expect(source).toContain("'dist/extensions/discord'");
    expect(source).toContain("'dist/extensions/slack'");
    expect(source).toContain("'dist/extensions/telegram'");
  });
});
