// ESLint flat config.
//
// Rules review (2026-05):
//  - react-hooks/rules-of-hooks: "error"  ✓ (hook-call correctness is non-negotiable)
//  - react-hooks/exhaustive-deps: "warn"  ✓ (pragmatic — some effect deps are
//    intentionally omitted, e.g. one-shot mount effects in PhaserCanvas)
//  - no-unused-vars: "warn" with ^_ ignore ✓ — covers Phaser lifecycle methods
//    that take unused args, and intentionally-unused destructures.
//  - no-explicit-any: "off" — see the audit note on that rule below.
//
// Finding — game-idiom conflict: react-hooks/rules-of-hooks treats any function
// named use* as a React hook. The engine uses use*-named game verbs (useItem,
// useEmitter, useQMine, useSpoofBadge, useBaffle, useOverrideKey, useEmp) that
// are NOT hooks. Engine files contain no React, so rules-of-hooks is disabled
// for src/engine/**/*.ts below (zero risk of masking real hook bugs). In React
// files a destructured game action keeps its real name and is called normally;
// rename the binding (e.g. `const { useItem: applyItem } = useGameActions()`)
// rather than disabling the rule there.

import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist", "node_modules", "vite.config.ts", "unmounted assets/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `any` audit (2026-05): 4 explicit `any` in src, all engine plumbing and
      // each documented inline —
      //   src/engine/EventBus.ts      ×3 (erased listener storage + 2 identity casts)
      //   src/engine/EngineAdapter.ts ×1 (Phaser scene-ctor arg list)
      // None are data payloads. Rule stays "off" because tightening it would
      // only flag these four necessary cases; re-audit if app-code `any` appears.
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Engine is headless game logic with no React; its use*-named functions are
    // game verbs, not hooks. Disable rules-of-hooks here to stop false positives.
    files: ["src/engine/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];
