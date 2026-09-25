import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next sets settings.react.version to "detect", which
  // makes eslint-plugin-react call context.getFilename() to locate and
  // read the installed react package — an API ESLint 10 removed
  // (replaced by the context.filename property), so it throws on every
  // file instead of just warning. Our React version is already fixed by
  // package.json, so there's nothing to detect; setting it explicitly
  // here overrides eslint-config-next's "detect" and skips that code
  // path entirely rather than waiting on eslint-plugin-react to update
  // for ESLint 10 (still unfixed as of eslint-plugin-react@7.37.5, its
  // latest release).
  {
    settings: {
      react: {
        version: "19.2.8",
      },
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
