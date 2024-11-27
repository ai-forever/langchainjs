import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
  ChatMessage,
  ChatMessageChunk,
  FunctionMessageChunk,
  HumanMessageChunk,
  isAIMessage,
  MessageContent,
  SystemMessageChunk,
} from "@langchain/core/messages";

import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  BaseChatModelCallOptions,
  type BaseChatModelParams,
  BindToolsInput,
  LangSmithParams,
} from "@langchain/core/language_models/chat_models";
import {
  FunctionCall,
  Function as _Function,
  Message,
  MessageRole,
  Chat,
  ChatFunctionCall,
  Usage,
  ChatCompletion,
  FunctionParameters,
  ChatCompletionChunk,
} from "gigachat/interfaces";
import { GigaChat as GigaChatClient, GigaChatClientConfig } from "gigachat";
import { zodToJsonSchema } from "zod-to-json-schema";
import { isLangChainTool } from "@langchain/core/utils/function_calling";
import {
  Runnable,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import {
  BaseLanguageModelInput,
  StructuredOutputMethodOptions,
} from "@langchain/core/language_models/base";
import { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { Choices } from "gigachat/interfaces/choices";
import { ToolCall, ToolCallChunk } from "@langchain/core/messages/tool";
import { z } from "zod";
import { isZodSchema } from "@langchain/core/utils/types";
import { BaseLLMOutputParser } from "@langchain/core/output_parsers";
import { JsonOutputKeyToolsParser } from "@langchain/core/output_parsers/openai_tools";

/* A type representing additional parameters that can be passed to the
 * GigaChat API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Kwargs = Record<string, any>;

export type ChatGigaChatToolType = _Function | BindToolsInput;

export interface GigaChatModelInput {
  /** Model name */
  model?: string;
  /** What sampling temperature to use. */
  temperature?: number;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
  /** top_p value to use for nucleus sampling. Must be between 0.0 and 1.0 */
  topP?: number;
  /** The penalty applied to repeated tokens */
  repetitionPenalty?: number;
  /** Minimum interval in seconds that elapses between sending tokens */
  updateInterval?: number;
}

export interface GigaChatInput extends GigaChatModelInput {
  /** Use GigaChat API for tokens count. */
  useApiForTokens?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Whether to stream the results or not */
  streaming?: boolean;
  /** Stop sequence */
  stopSequence?: Array<string>;
  /** Holds any additional parameters that are valid to pass to GigaChat
   *  that are not explicitly specified on this class.
   */
  invocationKwargs?: Kwargs;
}

/**
 * Input to chat model class.
 */
export interface GigaChatCallOptions
  extends BaseChatModelCallOptions,
    GigaChatModelInput {
  tools?: _Function[];
  tool_choice?: FunctionCall;
  model: string;
}

interface GigaChatLLMOutput {
  usage: Usage;
}

function extractGenericMessageCustomRole(message: ChatMessage) {
  if (
    message.role !== "system" &&
    message.role !== "assistant" &&
    message.role !== "user" &&
    message.role !== "function" &&
    message.role !== "function_in_progress" &&
    message.role !== "search_result"
  ) {
    console.warn(`Unknown message role: ${message.role}`);
  }

  return message.role as MessageRole;
}

function extractMessageContentString(content: MessageContent): string {
  if (content.constructor === String) {
    return content;
  } else if (content.constructor === Array) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => ("text" in part ? (part.text as string) : ""))
      .join(" ");
  }
  return "";
}

function messageToGigaChatRole(message: BaseMessage): MessageRole {
  const type = message.getType();
  switch (type) {
    case "system":
      return "system";
    case "ai":
      return "assistant";
    case "human":
      return "user";
    case "function":
      return "function";
    case "tool":
      return "function";
    case "generic": {
      if (!ChatMessage.isInstance(message))
        throw new Error("Invalid generic chat message");
      return extractGenericMessageCustomRole(message);
    }
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

function _convertMessageToPayload(_messages: BaseMessage[]): Message[] {
  return _messages.map((_message) => {
    const role = messageToGigaChatRole(_message);
    let content = extractMessageContentString(_message.content);
    if (role === "function") {
      content = JSON.stringify(content);
    }
    let function_call;
    if (isAIMessage(_message) && _message.tool_calls) {
      function_call = {
        name: _message.tool_calls[0].name,
        arguments: _message.tool_calls[0].args,
      };
    } else if (_message.additional_kwargs.function_call) {
      function_call = {
        name: _message.additional_kwargs.function_call.name,
        arguments: JSON.parse(
          _message.additional_kwargs.function_call.arguments
        ),
      };
    }
    const message: Message = {
      role,
      content,
      function_call,
      attachments:
        (_message.additional_kwargs.attachments as string[]) ?? undefined,
      functions_state_id:
        (_message.additional_kwargs.functions_state_id as string) ?? undefined,
    };
    return message;
  });
}

function gigachatResponseToChatMessage(
  choice: Choices,
  usage: Usage,
  includeRawResponse?: boolean
): BaseMessage {
  const rawToolCalls: FunctionCall | undefined = choice.message.function_call;
  switch (choice.message.role) {
    case "assistant": {
      const toolCalls: ToolCall[] = [];
      if (choice.message.function_call) {
        toolCalls.push({
          name: choice.message.function_call.name,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: choice.message.function_call.arguments as Record<string, any>,
        });
      }
      const additional_kwargs: Record<string, unknown> = {
        function_call: {
          name: choice.message.function_call?.name,
          arguments: JSON.stringify(choice.message.function_call?.arguments),
        },
        tool_calls: rawToolCalls,
        function_state_id: choice.message.functions_state_id,
      };
      if (includeRawResponse !== undefined) {
        additional_kwargs.__raw_response = choice;
      }

      return new AIMessage({
        content: choice.message.content || "",
        tool_calls: toolCalls,
        additional_kwargs,
        usage_metadata: {
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        },
      });
    }
    default:
      return new ChatMessage(
        choice.message.content || "",
        choice.message.role ?? "unknown"
      );
  }
}

function _convertDeltaToMessageChunk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chunk: ChatCompletionChunk,
  defaultRole?: MessageRole,
  includeRawResponse?: boolean
) {
  const { delta } = chunk.choices[0];
  const role = delta.role ?? defaultRole;
  const content = delta.content ?? "";
  let additional_kwargs: Record<string, unknown>;
  if (delta.function_call) {
    additional_kwargs = {
      function_call: {
        name: delta.function_call.name,
        arguments: JSON.stringify(delta.function_call.arguments),
      },
    };
  } else {
    additional_kwargs = {};
  }
  if (includeRawResponse) {
    additional_kwargs.__raw_response = chunk;
  }

  if (role === "user") {
    return new HumanMessageChunk({ content });
  } else if (role === "assistant") {
    const toolCallChunks: ToolCallChunk[] = [];
    if (delta.function_call) {
      toolCallChunks.push({
        name: delta.function_call.name,
        args: JSON.stringify(delta.function_call.arguments),
        type: "tool_call_chunk",
      });
    }
    return new AIMessageChunk({
      content,
      tool_call_chunks: toolCallChunks,
      additional_kwargs,
    });
  } else if (role === "system") {
    return new SystemMessageChunk({ content });
  } else if (role === "function") {
    return new FunctionMessageChunk({
      content,
      additional_kwargs,
    });
  } else {
    return new ChatMessageChunk({
      content,
      role: role ?? defaultRole ?? "assistant",
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isGigaChatTool(tool: any): tool is _Function {
  return "name" in tool && "parameters" in tool;
}

function removeEmpty<T>(obj: T): T {
  const newObj: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] === Object(obj[key])) newObj[key] = removeEmpty(obj[key]);
    else if (obj[key] !== undefined) newObj[key] = obj[key];
  }
  return newObj as T;
}

/**
 * Integration with a chat model.
 */
export class GigaChat<
    CallOptions extends GigaChatCallOptions = GigaChatCallOptions
  >
  extends BaseChatModel<CallOptions, AIMessageChunk>
  implements GigaChatInput
{
  static lc_name() {
    return "GigaChat";
  }

  lc_serializable = true;

  model = "GigaChat";

  useApiForTokens = false;

  streaming = false;

  verbose = false;

  temperature?: number;

  maxTokens?: number;

  topP?: number;

  repetitionPenalty?: number;

  updateInterval?: number;

  stopSequence?: Array<string>;

  invocationKwargs?: Kwargs;

  protected clientConfig: GigaChatClientConfig;

  protected _client?: GigaChatClient;

  get lc_secrets(): { [key: string]: string } | undefined {
    return {
      credentials: "GIGACHAT_CREDENTIALS",
      access_token: "GIGACHAT_ACCESS_TOKEN",
      password: "GIGACHAT_PASSWORD",
      key_file_password: "GIGACHAT_KEY_FILE_PASSWORD",
    };
  }

  get lc_aliases(): { [key: string]: string } | undefined {
    return {
      credentials: "GIGACHAT_CREDENTIALS",
      access_token: "GIGACHAT_ACCESS_TOKEN",
      user: "GIGACHAT_USER",
      password: "GIGACHAT_PASSWORD",
      scope: "GIGACHAT_SCOPE",
      key_file_password: "GIGACHAT_KEY_FILE_PASSWORD",
    };
  }

  getLsParams(options: this["ParsedCallOptions"]): LangSmithParams {
    const params = this.invocationParams(options);
    return {
      ls_provider: "giga-chat-model",
      ls_model_name: this.model,
      ls_model_type: "chat",
      ls_temperature: params.temperature ?? undefined,
      ls_max_tokens: params.max_tokens ?? undefined,
      ls_stop: options.stop,
    };
  }

  /**
   * Get the parameters used to invoke the model
   */
  override invocationParams(
    options?: this["ParsedCallOptions"]
  ): Omit<Chat, "messages"> & Kwargs {
    const tool_choice: ChatFunctionCall | undefined = options?.tool_choice;

    return {
      model: options?.model ?? this.model,
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      top_p: options?.topP ?? this.topP,
      repetitionPenalty: options?.repetitionPenalty ?? this.repetitionPenalty,
      update_interval: options?.updateInterval ?? this.updateInterval,
      stop_sequences: options?.stop ?? this.stopSequence,
      stream: this.streaming,
      functions: this.formatStructuredToolToGigaChat(options?.tools),
      function_call: tool_choice,
      ...this.invocationKwargs,
    };
  }

  constructor(
    fields?: GigaChatClientConfig & GigaChatInput & BaseChatModelParams
  ) {
    super(fields ?? {});
    this.model = fields?.model ?? this.model;
    this.useApiForTokens = fields?.useApiForTokens ?? this.useApiForTokens;
    this.streaming = fields?.streaming ?? this.streaming;
    this.verbose = fields?.verbose ?? this.verbose;
    this.temperature = fields?.temperature ?? this.temperature;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;
    this.topP = fields?.topP ?? this.topP;
    this.repetitionPenalty =
      fields?.repetitionPenalty ?? this.repetitionPenalty;
    this.updateInterval = fields?.updateInterval ?? this.updateInterval;
    this.stopSequence = fields?.stopSequence ?? this.stopSequence;
    this.invocationKwargs = fields?.invocationKwargs ?? this.invocationKwargs;

    this.clientConfig = {
      baseUrl: fields?.baseUrl,
      authUrl: fields?.authUrl,
      credentials: fields?.credentials,
      scope: fields?.scope,
      accessToken: fields?.accessToken,
      model: fields?.model,
      profanityCheck: fields?.profanityCheck,
      user: fields?.user,
      password: fields?.password,
      timeout: fields?.timeout,
      verifySslCerts: fields?.verifySslCerts,
      verbose: fields?.verbose,
      caBundle: fields?.caBundle,
      cert: fields?.cert,
      key: fields?.key,
      keyPassword: fields?.keyPassword,
      flags: fields?.flags,
      httpsAgent: fields?.httpsAgent,
    };
    this.clientConfig = removeEmpty(this.clientConfig);
    this._client = new GigaChatClient(this.clientConfig);
  }

  _llmType() {
    return "giga-chat-model";
  }

  override bindTools(
    tools: ChatGigaChatToolType[],
    kwargs?: Partial<CallOptions>
  ): Runnable<BaseLanguageModelInput, AIMessageChunk, CallOptions> {
    return this.bind({
      tools: this.formatStructuredToolToGigaChat(tools),
      ...kwargs,
    } as Partial<CallOptions>);
  }

  /**
   * Formats LangChain StructuredTools to GigaChat Functions.
   *
   * @param {ChatGigaChatToolType[] | undefined} tools The tools to format
   * @returns {_Function[] | undefined} The formatted tools, or undefined if none are passed.
   */
  formatStructuredToolToGigaChat(
    tools: ChatGigaChatToolType[] | undefined
  ): _Function[] | undefined {
    if (!tools || !tools.length) {
      return undefined;
    }
    return tools.map((tool) => {
      if (isGigaChatTool(tool)) {
        return tool;
      }
      if (isLangChainTool(tool)) {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: zodToJsonSchema(tool.schema) as _Function,
        };
      }
      throw new Error(
        `Unknown tool type passed to GigaChat: ${JSON.stringify(tool, null, 2)}`
      );
    });
  }

  _combineLLMOutput(...llmOutputs: GigaChatLLMOutput[]): GigaChatLLMOutput {
    return llmOutputs.reduce<{
      [key in keyof GigaChatLLMOutput]: Required<GigaChatLLMOutput[key]>;
    }>(
      (acc, llmOutput) => {
        if (llmOutput && llmOutput.usage) {
          acc.usage.completion_tokens += llmOutput.usage.completion_tokens ?? 0;
          acc.usage.prompt_tokens += llmOutput.usage.prompt_tokens ?? 0;
          acc.usage.total_tokens += llmOutput.usage.total_tokens ?? 0;
        }
        return acc;
      },
      {
        usage: {
          completion_tokens: 0,
          prompt_tokens: 0,
          total_tokens: 0,
        },
      }
    );
  }

  identifyingParams() {
    return {
      model_name: this.model,
      ...this.invocationParams(),
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const params = this.invocationParams(options);
    const formattedMessages = _convertMessageToPayload(messages);

    const stream = await this.createStreamWithRetry({
      ...params,
      messages: formattedMessages,
      stream: true,
    });

    if (!stream) {
      return;
    }

    for await (const data of stream) {
      // if (options.signal?.aborted) {
      //   stream.controller.abort();
      //   throw new Error("AbortError: User aborted the request.");
      // }
      const chunk = _convertDeltaToMessageChunk(data);

      const generationChunk = new ChatGenerationChunk({
        message: chunk,
        text: data.choices[0].delta.content ?? "",
      });
      yield generationChunk;

      await runManager?.handleLLMNewToken(
        data.choices[0].delta.content ?? "",
        undefined,
        undefined,
        undefined,
        undefined,
        { chunk: generationChunk }
      );
    }
  }

  /**
   * Creates a streaming request with retry.
   * @param request The parameters for creating a completion.
   * @param options
   * @returns A streaming request.
   */
  protected async createStreamWithRetry(
    request: Chat & Kwargs
  ): Promise<AsyncIterable<ChatCompletionChunk> | undefined> {
    const makeCompletionRequest = async () => this._client?.stream(request);
    return this.caller.call(makeCompletionRequest);
  }

  protected async completionWithRetry(
    request: Chat & Kwargs,
    options: this["ParsedCallOptions"]
  ): Promise<ChatCompletion> {
    const makeCompletionRequest = async () => await this._client?.chat(request);
    return this.caller.callWithOptions(
      { signal: options.signal ?? undefined },
      makeCompletionRequest
    );
  }

  /** @ignore */
  async _generateNonStreaming(
    messages: BaseMessage[],
    params: Omit<Chat, "messages"> & Kwargs,
    requestOptions: this["ParsedCallOptions"]
  ): Promise<ChatResult> {
    const response = await this.completionWithRetry(
      {
        ...params,
        stream: false,
        messages: _convertMessageToPayload(messages),
      },
      requestOptions
    );

    const generation = gigachatResponseToChatMessage(
      response.choices[0],
      response.usage
    );
    return {
      generations: [
        {
          message: generation,
          text: extractMessageContentString(generation.content),
          generationInfo: {
            finish_reason: response.choices[0].finish_reason,
          },
        },
      ],
      llmOutput: response,
    };
  }

  /** @ignore */
  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    if (this.stopSequence && options.stop) {
      throw new Error(
        `"stopSequence" parameter found in input and default params`
      );
    }

    const params = this.invocationParams(options);
    if (params.stream) {
      let finalChunk: ChatGenerationChunk | undefined;
      const stream = this._streamResponseChunks(messages, options, runManager);
      for await (const chunk of stream) {
        if (finalChunk === undefined) {
          finalChunk = chunk;
        } else {
          finalChunk = finalChunk.concat(chunk);
        }
      }
      if (finalChunk === undefined) {
        throw new Error("No chunks returned from GigaChat API.");
      }
      return {
        generations: [
          {
            text: finalChunk.text,
            message: finalChunk.message,
          },
        ],
      };
    } else {
      return this._generateNonStreaming(messages, params, options);
    }
  }

  withStructuredOutput<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunOutput extends Record<string, any> = Record<string, any>
  >(
    outputSchema:
      | z.ZodType<RunOutput>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | Record<string, any>,
    config?: StructuredOutputMethodOptions<false>
  ): Runnable<BaseLanguageModelInput, RunOutput>;

  withStructuredOutput<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunOutput extends Record<string, any> = Record<string, any>
  >(
    outputSchema:
      | z.ZodType<RunOutput>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | Record<string, any>,
    config?: StructuredOutputMethodOptions<true>
  ): Runnable<BaseLanguageModelInput, { raw: BaseMessage; parsed: RunOutput }>;

  withStructuredOutput<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    RunOutput extends Record<string, any> = Record<string, any>
  >(
    outputSchema:
      | z.ZodType<RunOutput>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      | Record<string, any>,
    config?: StructuredOutputMethodOptions<boolean>
  ):
    | Runnable<BaseLanguageModelInput, RunOutput>
    | Runnable<
        BaseLanguageModelInput,
        { raw: BaseMessage; parsed: RunOutput }
      > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema: z.ZodType<RunOutput> | Record<string, any> = outputSchema;
    const name = config?.name;
    const method = config?.method;
    const includeRaw = config?.includeRaw;
    if (method === "jsonMode" || method === "jsonSchema") {
      throw new Error(`Anthropic only supports "functionCalling" as a method.`);
    }

    let functionName = name ?? "extract";
    let outputParser: BaseLLMOutputParser<RunOutput>;
    let tools: _Function[];
    if (isZodSchema(schema)) {
      const jsonSchema = zodToJsonSchema(schema as z.ZodType<RunOutput>);
      tools = [
        {
          name: functionName,
          description:
            jsonSchema.description ?? "A function available to call.",
          parameters: jsonSchema as FunctionParameters,
        },
      ];
      outputParser = new JsonOutputKeyToolsParser({
        returnSingle: true,
        keyName: functionName,
        zodSchema: schema,
      });
    } else {
      let gigachatTools: _Function;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema_ = schema as Record<string, any>;
      if (
        typeof schema_.name === "string" &&
        typeof schema_.description === "string" &&
        typeof schema_.parameters === "object" &&
        schema_.parameters != null
      ) {
        gigachatTools = schema as _Function;
        functionName = schema_.name;
      } else {
        gigachatTools = {
          name: functionName,
          description: schema.description ?? "",
          parameters: schema as FunctionParameters,
        };
      }
      tools = [gigachatTools];
      outputParser = new JsonOutputKeyToolsParser<RunOutput>({
        returnSingle: true,
        keyName: functionName,
      });
    }

    const llm = this.bindTools(tools, {
      tool_choice: { name: functionName },
      ...config,
    } as Partial<CallOptions>);

    if (!includeRaw) {
      return llm.pipe(outputParser).withConfig({
        runName: "GigaChatStructuredOutput",
      }) as Runnable<BaseLanguageModelInput, RunOutput>;
    }

    const parserAssign = RunnablePassthrough.assign({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsed: (input: any, config) => outputParser.invoke(input.raw, config),
    });
    const parserNone = RunnablePassthrough.assign({
      parsed: () => null,
    });
    const parsedWithFallback = parserAssign.withFallbacks({
      fallbacks: [parserNone],
    });
    return RunnableSequence.from<
      BaseLanguageModelInput,
      { raw: BaseMessage; parsed: RunOutput }
    >([
      {
        raw: llm,
      },
      parsedWithFallback,
    ]).withConfig({
      runName: "StructuredOutputRunnable",
    });
  }
}
