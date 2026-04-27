-- Audit log of every MCP tool invocation. Wraps `server.registerTool` in
-- src/mcp.ts so every call is captured transparently — no changes to
-- individual tool files needed.
--
-- args_json and result_text are stored as TEXT, truncated to ~4 KB at
-- the application layer to keep rows small. Large get_context responses
-- get clipped; the truncation marker `[…truncated]` makes that obvious.

CREATE TABLE tool_calls (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  args_json    TEXT,                  -- JSON of input args (or NULL)
  result_text  TEXT,                  -- text portion of the tool result
  duration_ms  INTEGER NOT NULL,
  error        TEXT,                  -- error message; NULL on success
  called_at    TEXT NOT NULL,         -- UTC ISO timestamp
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tool_calls_user_called ON tool_calls(user_id, called_at DESC);
CREATE INDEX idx_tool_calls_called      ON tool_calls(called_at DESC);
CREATE INDEX idx_tool_calls_name        ON tool_calls(tool_name, called_at DESC);
