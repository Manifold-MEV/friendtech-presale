import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "src/gen/generated.ts",
  contracts: [],
  plugins: [foundry({ 
    artifacts: "out" 
  })],
});
