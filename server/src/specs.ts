/**
 * @license
 * Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as fsExtra from 'fs-extra';
import * as path from 'path';
import {BenchmarkSpec, ConfigFormat} from './types';
import {parsePackageVersions} from './versions';

const ignoreFiles = new Set([
  'node_modules',
  'package.json',
  'package-lock.json',
  'common',
  'versions',
]);

interface Opts {
  name: string;
  implementation: string;
  variant: string;
  'package-version': string[];
}

/**
 * Derive the set of benchmark specifications we should run according to the
 * given options, which may require checking the layout on disk of the
 * benchmarks/ directory.
 */
export async function specsFromOpts(
    repoRoot: string, opts: Opts): Promise<BenchmarkSpec[]> {
  const versions = parsePackageVersions(opts['package-version']);

  const specs: BenchmarkSpec[] = [];
  let impls;
  if (opts.implementation === '*') {
    impls = await fsExtra.readdir(path.join(repoRoot, 'benchmarks'));
    impls = impls.filter((dir) => !ignoreFiles.has(dir));
  } else {
    impls = opts.implementation.split(',');
    const badNames = impls.filter((dir) => ignoreFiles.has(dir));
    if (badNames.length > 0) {
      throw new Error(
          `Implementations cannot be named ${badNames.join(' or ')}`);
    }
  }

  const variants = new Set(
      opts.variant.split(',').map((v) => v.trim()).filter((v) => v !== ''));

  for (const implementation of impls) {
    const implDir = path.join(repoRoot, 'benchmarks', implementation);
    let benchmarks;
    if (opts.name === '*') {
      benchmarks = await fsExtra.readdir(implDir);
      benchmarks = benchmarks.filter((implDir) => !ignoreFiles.has(implDir));
    } else {
      benchmarks = opts.name.split(',');
      const badNames = benchmarks.filter((dir) => ignoreFiles.has(dir));
      if (badNames.length > 0) {
        throw new Error(`Benchmarks cannot be named ${badNames.join(' or ')}`);
      }
    }
    for (const name of benchmarks) {
      const benchDir = path.join(implDir, name);
      if (!await fsExtra.pathExists(benchDir)) {
        continue;
      }
      let config: ConfigFormat|undefined;
      try {
        config = await fsExtra.readJson(path.join(benchDir, 'benchmarks.json'));
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      const implVersions = versions.get(implementation) ||
          [{label: 'default', dependencyOverrides: {}}];
      const partialSpec = {
        name,
        implementation,
      };
      if (config && config.variants && config.variants.length) {
        for (const variant of config.variants) {
          if (variant.name &&
              (variants.has('*') || variants.has(variant.name))) {
            for (const version of implVersions) {
              specs.push({
                ...partialSpec,
                version,
                variant: variant.name || '',
                config: variant.config || {},
              });
            }
          }
        }
      } else if (opts.variant === '*') {
        for (const version of implVersions) {
          specs.push({
            ...partialSpec,
            version,
            variant: '',
            config: {},
          });
        }
      }
    }
  }

  specs.sort((a, b) => {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    if (a.variant !== b.variant) {
      return a.variant.localeCompare(b.variant);
    }
    if (a.implementation !== b.implementation) {
      return a.implementation.localeCompare(b.implementation);
    }
    if (a.version.label !== b.version.label) {
      return a.version.label.localeCompare(b.version.label);
    }
    return 0;
  });

  return specs;
}