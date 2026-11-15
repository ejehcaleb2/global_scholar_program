import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.tsx"],
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement[name.name='button']",
        message: "Use the shared Button component instead of a native button.",
      }, {
        selector: "JSXAttribute[name.name='suppressHydrationWarning']",
        message: "Hydration suppression is restricted to RootLayout html only.",
      }],
    },
  },
  {
    files: ["components/ui/button.tsx"],
    rules: { "no-restricted-syntax": ["error", { selector: "JSXAttribute[name.name='suppressHydrationWarning']", message: "Do not suppress hydration warnings in Button." }] },
  },
  {
    files: ["components/ui/rich-content.tsx"],
    rules: { "react/no-danger": "off" },
  },
  {
    files: ["app/layout.tsx"],
    rules: { "no-restricted-syntax": ["error", {
      selector: "JSXOpeningElement[name.name='button']",
      message: "Use the shared Button component instead of a native button.",
    }, {
      selector: "JSXOpeningElement:not([name.name='html']) > JSXAttribute[name.name='suppressHydrationWarning']",
      message: "Only the root html element may suppress the verified extension mismatch.",
    }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next*/**",
    ".next-h1-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
