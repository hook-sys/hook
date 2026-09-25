// Test double for @/lib/integrations/claude: returns whatever client the test installs.
export async function getClaudeClient() {
  return globalThis.__fakeClaude;
}
export async function testClaudeApiKey() {
  return { ok: true, message: "Connected to the Anthropic API." };
}
