import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", ".scratch/**", "data/**", "playwright-report/**", "test-results/**"] },
];

export default config;
