import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";
import { chunkArray } from "@langchain/core/utils/chunk_array";
import { GigaChat, GigaChatClientConfig } from "gigachat";

/**
 * Interface for GigachatEmbeddings parameters. Extends EmbeddingsParams and
 * defines additional parameters specific to the GigaChat embeddings class.
 */
export interface GigaChatEmbeddingsParams extends EmbeddingsParams {
  /**
   * Prefix for embeddings
   * @default {"Дано предложение, необходимо найти его парафраз \nпредложение: "}
   */
  prefixQuery?: string;
  /**
   * Use prefix or not
   * @default {false}
   */
  usePrefixQuery?: boolean;
  /**
   * The maximum number of documents to embed in a single request.
   * @default {512}
   */
  batchSize?: number;
  /**
   * Whether to strip new lines from the input text. This is recommended,
   * but may not be suitable for all use cases.
   * @default {true}
   */
  stripNewLines?: boolean;
  /** Model name to use */
  model?: string;
}

/**
 * Class for generating embeddings using the GigaChat API.
 * @example
 * ```typescript
 * // Embed a query using GigaChatEmbeddings to generate embeddings for a given text
 * const model = new GigaChatEmbeddings();
 * const res = await model.embedQuery(
 *   "What would be a good company name for a company that makes colorful socks?",
 * );
 * console.log({ res });
 *
 * ```
 */
export class GigaChatEmbeddings
  extends Embeddings
  implements GigaChatEmbeddingsParams
{
  prefixQuery =
    "Дано предложение, необходимо найти его парафраз \nпредложение: ";

  usePrefixQuery = false;

  batchSize = 512;

  stripNewLines = true;

  model: string = "Embeddings";

  protected clientConfig: GigaChatClientConfig;

  protected _client: GigaChat;

  constructor(fields?: GigaChatEmbeddingsParams & GigaChatClientConfig) {
    super(fields ?? {});
    this.prefixQuery = fields?.prefixQuery ?? this.prefixQuery;
    this.usePrefixQuery = fields?.usePrefixQuery ?? this.usePrefixQuery;
    this.batchSize = fields?.batchSize ?? this.batchSize;
    this.stripNewLines = fields?.stripNewLines ?? this.stripNewLines;
    this.model = fields?.model ?? this.model;

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
    this._client = new GigaChat(this.clientConfig);
  }

  /**
   * Method to generate embeddings for an array of documents. Splits the
   * documents into batches and makes requests to the OpenAI API to generate
   * embeddings.
   * @param texts Array of documents to generate embeddings for.
   * @returns Promise that resolves to a 2D array of embeddings for each document.
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const textsWithPrefix = this.usePrefixQuery
      ? texts.map((t) => this.prefixQuery + t)
      : texts;
    const batches = chunkArray(
      this.stripNewLines
        ? textsWithPrefix.map((t) => t.replace(/\n/g, " "))
        : textsWithPrefix,
      this.batchSize
    );

    const batchRequests = batches.map((batch) =>
      this.embeddingWithRetry(batch)
    );
    const batchResponses = await Promise.all(batchRequests);

    const embeddings: number[][] = [];
    for (let i = 0; i < batchResponses.length; i += 1) {
      const batch = batches[i];
      const { data: batchResponse } = batchResponses[i];
      for (let j = 0; j < batch.length; j += 1) {
        embeddings.push(batchResponse[j].embedding);
      }
    }
    return embeddings;
  }

  /**
   * Method to generate an embedding for a single document. Calls the
   * embeddingWithRetry method with the document as the input.
   * @param text Document to generate an embedding for.
   * @returns Promise that resolves to an embedding for the document.
   */
  async embedQuery(text: string): Promise<number[]> {
    const textWithPrefix = this.usePrefixQuery ? this.prefixQuery + text : text;
    const { data } = await this.embeddingWithRetry(
      this.stripNewLines ? textWithPrefix.replace(/\n/g, " ") : textWithPrefix
    );
    return data[0].embedding;
  }

  /**
   * Private method to make a request to the GigaChat API to generate
   * embeddings. Handles the retry logic and returns the response from the
   * API.
   * @param input String or array of strings to embedding
   * @returns Promise that resolves to the response from the API.
   */
  protected async embeddingWithRetry(input: string | Array<string>) {
    return this.caller.call(async () => {
      const input_ = Array.isArray(input) ? input : [input];
      return await this._client.embeddings(input_, this.model);
    });
  }
}
