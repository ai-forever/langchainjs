<div align="center" id="top">

[![GitHub License](https://img.shields.io/github/license/ai-forever/langchain-gigachat?style=flat-square)](https://opensource.org/license/MIT)
![npm](https://img.shields.io/npm/dm/langchain-gigachat)
[![GitHub star chart](https://img.shields.io/github/stars/ai-forever/langchainjs?style=flat-square)](https://www.star-history.com/#ai-forever/langchainjs)

[English](README.md) | [Русский](README-ru_RU.md)

</div>

# langchain-gigachat

This is a library integration with [GigaChat](https://giga.chat/).

## Installation

```bash
npm install --save langchain-gigachat
```

## Quickstart

Follow these simple steps to get up and running quickly.

### Installation

To install the package use following command:

```shell
npm install --save langchain-gigachat
```

### Initialization

To initialize chat model:

```js
import { GigaChat } from "langchain-gigachat"
import { Agent } from 'node:https';

const httpsAgent = new Agent({
    rejectUnauthorized: false,
});

const giga = new GigaChat({
    credentials: 'YOUR_AUTHORIZATION_KEY',
    model: 'GigaChat-Max',
    httpsAgent
})
```

### Usage

Use the GigaChat object to generate responses:

```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const messages = [
    new SystemMessage("Translate following messages to portugese"),
    new HumanMessage("Hello, world!"),
];

const resp = await giga.invoke(messages);

console.log(resp.content);
```

Use the GigaChat object to create embeddings:

```js
import { GigaChatEmbeddings } from "langchain-gigachat";
import { Agent } from 'node:https';

const httpsAgent = new Agent({
    rejectUnauthorized: false,
});

async function main() {
  const embeddings = new GigaChatEmbeddings({
    credentials: 'YOUR_AUTHORIZATION_KEY',
    httpsAgent
  });

  console.log(await embeddings.embedDocuments(["Словасловаслова"]));
}

main();
```

Now you can use the GigaChat object with LangChainJS's standard primitives to create LLM-applications.
