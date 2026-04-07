import { describe, expect, test } from "@jest/globals";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import type { Function as GigaChatFunction } from "gigachat/interfaces";

import { GigaChat } from "../chat_models.js";

class CapturingGigaChat extends GigaChat {
  capturedTools?: GigaChatFunction[];

  override bindTools(...args: Parameters<GigaChat["bindTools"]>) {
    this.capturedTools = this.formatStructuredToolToGigaChat(args[0]);
    return super.bindTools(...args);
  }
}

describe("GigaChat schema normalization", () => {
  test("merges union variants from LangChain tool schemas", () => {
    const saveTool = tool(
      async (input) => JSON.stringify(input),
      {
        name: "save",
        description: "Save data",
        schema: z.object({
          dest: z.union([
            z.object({
              path: z.string().describe("file path"),
            }),
            z.object({
              url: z.string().describe("endpoint URL"),
            }),
          ]),
        }),
      }
    );

    const model = new GigaChat();
    const tools = model.formatStructuredToolToGigaChat([saveTool]);
    const destSchema = tools?.[0]?.parameters?.properties?.dest as Record<
      string,
      unknown
    >;

    expect(destSchema.type).toBe("object");
    expect(destSchema.required).toEqual(["_type"]);
    expect(destSchema.properties).toMatchObject({
      _type: expect.objectContaining({
        type: "string",
      }),
      path: expect.objectContaining({
        type: "string",
      }),
      url: expect.objectContaining({
        type: "string",
      }),
    });
  });

  test("normalizes preformatted nested object properties", () => {
    const preformattedTool: GigaChatFunction = {
      name: "update_files",
      description: "Updates files",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "File ID",
          },
          properties: {
            type: "object",
            description: "Key-value pairs",
          },
        },
        required: ["fileId"],
      },
    };

    const model = new GigaChat();
    const tools = model.formatStructuredToolToGigaChat([preformattedTool]);
    const nestedProperties = tools?.[0]?.parameters?.properties
      ?.properties as Record<string, unknown>;

    expect(nestedProperties.type).toBe("object");
    expect(nestedProperties.properties).toEqual({});
  });

  test("normalizes withStructuredOutput schemas before binding tools", () => {
    const model = new CapturingGigaChat();

    model.withStructuredOutput(
      z.object({
        dest: z.union([
          z.object({
            path: z.string(),
          }),
          z.object({
            url: z.string(),
          }),
        ]),
      }),
      { name: "extract" }
    );

    const destSchema = model.capturedTools?.[0]?.parameters?.properties
      ?.dest as Record<string, unknown>;

    expect(destSchema.type).toBe("object");
    expect(destSchema.required).toEqual(["_type"]);
    expect(destSchema.properties).toMatchObject({
      _type: expect.objectContaining({
        type: "string",
      }),
      path: expect.objectContaining({
        type: "string",
      }),
      url: expect.objectContaining({
        type: "string",
      }),
    });
  });
});
