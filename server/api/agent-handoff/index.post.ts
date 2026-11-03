import { serverSupabaseServiceRole } from "#supabase/server";
import type { Database } from "../../../types/supabase/database";
import { createAgentHandoffHandler } from "../../utils/agent-handoff/handler";
import { authorizeCanvaUser } from "../../utils/agent-handoff/canva";
import {
  generateDesignRequest,
  validateAgentHandoff,
} from "../../services/agent-handoff.service";
import { insertDesignRequest } from "../../services/design-requests.service";

export default createAgentHandoffHandler((event) => useRuntimeConfig(event), {
  authorize: authorizeCanvaUser,
  validate: validateAgentHandoff,
  process: (handoff, event) =>
    generateDesignRequest(handoff, {
      // Supply model: new AiModelAdapter(providerFunction) when a provider is configured.
      save: (input) =>
        insertDesignRequest(serverSupabaseServiceRole<Database>(event), input),
    }),
});
