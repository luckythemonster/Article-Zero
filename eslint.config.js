import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["dist", "node_modules", "vite.config.ts"],
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
      //   src/engine/EventBus.ts   ×3 (erased listener storage + 2 identity casts)
      //   src/engine/EngineAdapter.ts ×1 (Phaser scene-ctor arg list)
      // None are data payloads. Rule stays "off" because tightening it would
      // only flag these four necessary cases; re-audit if app-code `any` appears.
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
