import { StreamingStepInput } from "@superflows/chat-ui-react/dist/src/lib/types";
import { exponentialRetryWrapper } from "../../utils";
import {
  parseAnthropicStreamedData,
  parseGPTStreamedData,
} from "../../parsers/parsers";
import { replacePlaceholdersDuringStreaming } from "../../edge-runtime/angelaUtils";
import {
  GPTChatFormatToClaudeInstant,
  streamLLMResponse,
} from "../../queryLLM";
import {
  isUserRequestPossibleLLMParams,
  isUserRequestPossiblePrompt,
  ParsedRequestPossibleOutput,
  parseRequestPossibleOutput,
} from "../prompts/isUserRequestPossible";
import { ChatGPTMessage } from "../../models";
import {
  clarificationLLMParams,
  clarificationPrompt,
  parseClarificationOutput,
  ParsedClarificationOutput,
} from "../prompts/clarificationPrompt";
import { Action, Organization } from "../../types";

if (!process.env.CLARIFICATION_MODEL) {
  throw new Error("CLARIFICATION_MODEL env var is not defined");
}
const clarificationModel = process.env.CLARIFICATION_MODEL;

if (!process.env.IS_USER_REQUEST_POSSIBLE_MODEL) {
  throw new Error("IS_USER_REQUEST_POSSIBLE_MODEL env var is not defined");
}
const isUserRequestPossibleModel = process.env.IS_USER_REQUEST_POSSIBLE_MODEL;

export async function runClarificationAndStreamResponse(
  chatHistory: ChatGPTMessage[],
  selectedActions: Action[],
  orgInfo: Pick<Organization, "name" | "description">,
  userDescription: string,
  conversationId: number,
  streamInfo: (step: StreamingStepInput) => void,
): Promise<{
  message: ChatGPTMessage | null;
  possible: boolean;
  clear: boolean;
}> {
  const placeholderToOriginalMap = {
    FUNCTIONS: "functions",
    FUNCTION: "function",
  };

  var streamedText = "",
    isPossible = null;

  // Run isPossible and clarification prompts in parallel in Promise.all()
  const outs = await Promise.all([
    // Run isPossible
    (async (): Promise<
      | { output: string; parsed: ParsedRequestPossibleOutput }
      | { error: string }
    > => {
      const prompt = isUserRequestPossiblePrompt({
        chatHistory,
        selectedActions,
        orgInfo,
        userDescription,
      });
      console.log("Prompt for isUserRequestPossible: ", prompt[0].content);
      const res = await exponentialRetryWrapper(
        streamLLMResponse,
        [prompt, isUserRequestPossibleLLMParams, isUserRequestPossibleModel],
        3,
      );
      if (res === null || "message" in res) {
        console.error(
          `OpenAI API call failed for conversation with id: ${conversationId}. The error was: ${JSON.stringify(
            res,
          )}`,
        );
        return { error: "Call to Language Model API failed" };
      }

      // Stream response chunk by chunk
      const decoder = new TextDecoder();
      const reader = res.getReader();
      let parsedOutput: ParsedRequestPossibleOutput;

      let rawOutput = "",
        done = false,
        incompleteChunk = "",
        first = true;
      // Below buffer is used to store the partial value of a variable if it's split across multiple chunks
      let placeholderBuffer = "";

      // https://web.dev/streams/#asynchronous-iteration
      while (!done) {
        const { value, done: doneReading } = await reader.read();

        done = doneReading;
        if (done) break;

        const contentItems = parseGPTStreamedData(
          incompleteChunk + decoder.decode(value),
        );

        incompleteChunk = contentItems.incompleteChunk ?? "";

        for (let content of contentItems.completeChunks) {
          // Sometimes starts with a newline
          if (first) {
            content = content.trimStart();
            first = false;
          }
          // Raw output is the actual output from the LLM!
          rawOutput += content;
          // What streams back to the user has the variables replaced with their real values
          //  so FUNCTIONS is replaced by the actual URL
          ({ content, placeholderBuffer } = replacePlaceholdersDuringStreaming(
            content,
            placeholderBuffer,
            placeholderToOriginalMap,
          ));
          if (content) {
            console.log("Poss:", content);
            parsedOutput = parseRequestPossibleOutput(rawOutput);
            // If the output contains a "Tell user:" section, it's impossible. Also stream the reason to the user
            if (isPossible === null && parsedOutput.tellUser) {
              console.log("Tell user is present, so now streaming tellUser!");
              isPossible = false;
            }
            if (isPossible === false) {
              streamInfo({ role: "assistant", content });
              streamedText += content;
            }
          }
        }
        done = contentItems.done;
      }

      return {
        output: rawOutput,
        parsed: parseRequestPossibleOutput(rawOutput),
      };
    })(),
    (async (): Promise<
      { output: string; parsed: ParsedClarificationOutput } | { error: string }
    > => {
      // Run clarification
      const prompt = clarificationPrompt({
        chatHistory,
        selectedActions,
        orgInfo,
        userDescription,
      });
      console.log(
        "Prompt for clarification: ",
        GPTChatFormatToClaudeInstant(prompt),
      );
      const res = await exponentialRetryWrapper(
        streamLLMResponse,
        [prompt, clarificationLLMParams, clarificationModel],
        3,
      );
      if (res === null || "message" in res) {
        console.error(
          `OpenAI API call failed for conversation with id: ${conversationId}. The error was: ${JSON.stringify(
            res,
          )}`,
        );
        return { error: "Call to Language Model API failed" };
      }

      // Stream response chunk by chunk
      const decoder = new TextDecoder();
      const reader = res.getReader();

      let rawOutput = "Thoughts:\n1. ",
        done = false,
        incompleteChunk = "",
        first = true;
      let parsedOutput: ParsedClarificationOutput;
      // Below buffer is used to store the partial value of a variable if it's split across multiple chunks
      let placeholderBuffer = "";

      // https://web.dev/streams/#asynchronous-iteration
      while (!done) {
        const { value, done: doneReading } = await reader.read();

        done = doneReading;
        if (done) break;

        const contentItems = parseAnthropicStreamedData(
          incompleteChunk + decoder.decode(value),
        );

        incompleteChunk = contentItems.incompleteChunk ?? "";

        for (let content of contentItems.completeChunks) {
          // Sometimes starts with a newline
          if (first) {
            content = content.trimStart();
            first = false;
          }
          // Raw output is the actual output from the LLM!
          rawOutput += content;
          // What streams back to the user has the variables replaced with their real values
          //  so URL1 is replaced by the actual URL
          ({ content, placeholderBuffer } = replacePlaceholdersDuringStreaming(
            content,
            placeholderBuffer,
            placeholderToOriginalMap,
          ));

          if (content) {
            parsedOutput = parseClarificationOutput(rawOutput);
            if (isPossible) {
              console.log(
                "isPossible is true, so now streaming clarification!",
              );
              const newText = parsedOutput.tellUser.replace(streamedText, "");
              streamInfo({ role: "assistant", content: newText });
              streamedText += newText;
            }
          }
        }
        done = contentItems.done;
      }
      return { output: rawOutput, parsed: parseClarificationOutput(rawOutput) };
    })(),
  ]);

  // If clarification finishes before isPossible
  console.log("streamedText", streamedText);
  if (!("error" in outs[1]) && !outs[1].parsed.clear && !streamedText) {
    console.log("Anthropic beat GPT!");
    streamedText = outs[1].parsed.tellUser;
    streamInfo({ role: "assistant", content: outs[1].parsed.tellUser });
  }

  // TODO: If not possible, but clear, but no tell user section in isPossible output?

  // TODO: Add caching of isPossible and clarification outputs
  const possible = "error" in outs[0] || outs[0].parsed.possible;
  const clear = "error" in outs[1] || outs[1].parsed.clear;
  console.log("clarification out:", {
    possibleMessage:
      "error" in outs[0]
        ? null
        : { role: "assistant", content: outs[0].output },
    possible,
    clarificationMessage:
      "error" in outs[1]
        ? null
        : { role: "assistant", content: outs[1].output },
    clear,
  });
  return {
    message:
      !possible && !("error" in outs[0]) && outs[0].parsed.tellUser
        ? { role: "assistant", content: outs[0].output }
        : !clear && !("error" in outs[1]) && outs[1].parsed.tellUser
        ? { role: "assistant", content: outs[1].output }
        : null,
    possible,
    clear,
  };
}