// Test double for @/lib/integrations/claude: returns whatever client the test installs.
export async function getClaudeClient() {
  return globalThis.__fakeClaude;
}
