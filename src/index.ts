/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/openai/gpt-oss-120b";

// Default system prompt
const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
  /**
   * Main request handler for the Worker
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle static assets (frontend)
    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // API Routes
    if (url.pathname === "/api/chat") {
      // Handle POST requests for chat
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }

      // Method not allowed for other request types
      return new Response("Method not allowed", { status: 405 });
    }

    // Handle 404 for unmatched routes
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Parse JSON request body according to oss-120b API schema
    // Define the oss-120b input schema type
    type Oss120bInput = {
      input: string | any[];
      reasoning?: {
        effort?: "low" | "medium" | "high";
        summary?: "auto" | "concise" | "detailed";
      };
    };
    const body = await request.json() as Oss120bInput;
    const { input, reasoning } = body;
    if (!input) {
      return new Response(
        JSON.stringify({ error: 'Missing required "input" field.' }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    // Prepare model payload
    const payload: any = {
      input,
      max_tokens: 1024,
    };
    if (reasoning) {
      payload.reasoning = reasoning;
    }

    // Call model
    const response = await env.AI.run(
      MODEL_ID as any,
      payload,
      {
        returnRawResponse: true,
        gateway: {
          id: "oss-120b-free",
          skipCache: false,
          cacheTtl: 3600,
        },
      },
    );

    // Output: oneOf application/json or text/event-stream
    // If response is a stream, set content-type accordingly
    if (response instanceof Response) {
      // If streaming, set content-type to text/event-stream
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/event-stream')) {
        return response;
      }
      // Otherwise, assume JSON
      return new Response(await response.text(), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Fallback: return as JSON
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
