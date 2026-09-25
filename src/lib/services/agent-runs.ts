import type { ToolCallLog } from "@/lib/agent/runner";
import { createClient } from "@/lib/supabase/server";

export interface AgentRun {
  id: string;
  client_id: string;
  user_id: string | null;
  request: string;
  options: { allowPaidGeneration?: boolean; allowDriveUpload?: boolean };
  status: "running" | "succeeded" | "failed" | "stopped";
  tool_calls: ToolCallLog[];
  result: string | null;
  error: string | null;
  turns: number;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
  finished_at: string | null;
}

// Caller's session: super admins see all runs; sub-admins only their own (RLS).
export async function listAgentRuns(clientId: string): Promise<AgentRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data ?? []) as AgentRun[];
}
