#!/usr/bin/env node
// Validates the canonical onboarding v2 config and (re)generates the committed
// server + client copies. Run explicitly:  npm run build:onboarding-config
// Deliberately NOT wired into any prestart/prebuild/predeploy hook.
//
//   canonical:  shared/onboarding/v2.json
//   generated:  server/src/onboarding/v2.config.json
//               client/src/onboarding/v2.config.json
//
// The shared validate/serialize/generate logic lives in ./onboardingConfigLib.cjs
// so the server's CommonJS parity test can require it directly.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { generate } = require('./onboardingConfigLib.cjs');

const written = generate();
for (const w of written) console.log(`wrote ${w}`);
console.log('onboarding v2 config validated and generated.');
