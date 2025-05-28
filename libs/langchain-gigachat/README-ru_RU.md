<div align="center" id="top">

[![GitHub License](https://img.shields.io/github/license/ai-forever/langchain-gigachat?style=flat-square)](https://opensource.org/license/MIT)
![npm](https://img.shields.io/npm/dm/langchain-gigachat)
[![GitHub star chart](https://img.shields.io/github/stars/ai-forever/langchainjs?style=flat-square)](https://www.star-history.com/#ai-forever/langchainjs)

[English](README.md) | [Русский](README-ru_RU.md)

</div>

# langchain-gigachat

Библиотека `langchain-gigachat` позволяет использовать нейросетевые модели GigaChat при разработке LLM-приложений с помощью фреймворков LangChainJS и LangGraphJS.

Библиотека входит в набор решений [GigaChain](https://github.com/ai-forever/gigachain).

## Требования

Для работы с библиотекой и обмена сообщениями с моделями GigaChat понадобятся:

* NodeJS версии 18 и выше;
* [сертификат НУЦ Минцифры](https://developers.sber.ru/docs/ru/gigachat/certificates);
* [ключ авторизации](https://developers.sber.ru/docs/ru/gigachat/quickstart/ind-using-api#poluchenie-avtorizatsionnyh-dannyh) GigaChat API.

> [!NOTE]
> Вы также можете использовать другие [способы авторизации](#способы-авторизации).

## Установка

Для установки библиотеки используйте менеджер пакетов NPM:

```sh
npm install --save langchain-gigachat
```

## Быстрый старт

### Запрос на генерацию

Пример запроса на генерацию с системным промптом:

```ts
import { GigaChat } from "langchain-gigachat"
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Agent } from 'node:https';

/**
 * Объект с параметрами HTTPS подключения к GigaChat API.
 * Отключает проверку сертификатов НУЦ Минцифры для запуска примера.
 */
const httpsAgent = new Agent({
    rejectUnauthorized: false,
});

const giga = new GigaChat({
    credentials: 'ключ_авторизации',
    model: 'GigaChat-Max',
    httpsAgent
})

const messages = [
    new SystemMessage("Переведи следующее сообщение на английский"),
    new HumanMessage("Привет!"),
];

const resp = await giga.invoke(messages);

console.log(resp.content);
```

### Создание эмбеддингов

Пример создания векторного представления текста:

```ts
import { GigaChatEmbeddings } from "langchain-gigachat";
import { Agent } from 'node:https';

/**
 * Объект с параметрами HTTPS подключения к GigaChat API.
 * Отключает проверку сертификатов НУЦ Минцифры для запуска примера.
 */
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

## Параметры объекта GigaChat

В таблице описаны параметры, которые можно передать при инициализации объекта GigaChat:

| Параметр                  | Описание                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credentials`             | Ключ авторизации для обмена сообщениями с GigaChat API.<br />Ключ авторизации содержит информацию о версии API, к которой выполняются запросы. Если вы используете версию API для ИП или юрлиц, укажите это явно в параметре `scope`                                                                                                                                                                    |
| `scope`                   | Версия API, к которой будет выполнен запрос. По умолчанию запросы передаются в версию для физических лиц. Возможные значения:<ul><li>`GIGACHAT_API_PERS` — версия API для физических лиц;</li><li>`GIGACHAT_API_B2B` — версия API для ИП и юрлиц при работе по предоплате.</li><li>`GIGACHAT_API_CORP` — версия API для ИП и юрлиц при работе по постоплате.</li></ul>                                  |
| `model`                   | Необязательный параметр, в котором можно явно задать [модель GigaChat](https://developers.sber.ru/docs/ru/gigachat/models). Список доступных моделей можно получить с помощью метода `getModels()`.<br /><br />Стоимость запросов к разным моделям отличается. Подробная информация о тарификации — в [официальной документации GigaChat API](https://developers.sber.ru/docs/ru/gigachat/api/tariffs)  |
| `baseUrl`                 | Адрес GigaChat API. По умолчанию запросы отправляются по адресу `https://gigachat.devices.sberbank.ru/api/v1/`. Для работы с [моделями в раннем доступе](https://developers.sber.ru/docs/ru/gigachat/models/preview-models), укажите адрес `https://gigachat-preview.devices.sberbank.ru/api/v1`                                                                                                        |
| `httpsAgent`              | Объект с параметрами HTTPS-подключения. Объект добавляется при подключении к серверу API и позволяет настроить подключение по сертификату, отключить проверки сертификата Минцифры и задать другие парметры.<br/><br/>Не поддерживается при запуске в браузере                                                                                                                                          |
| `dangerouslyAllowBrowser` | Флаг, который включает библиотеку в браузере. По умолчанию, работа в браузере отключена.<br />Используйте с осторожностью, так как работа в браузере может скомпрометировать ключ авторизации GigaChat API                                                                                                                                                                                              |
| `timeout`                 | Необязательный параметр, задающий время ожидания ответа в секундах, которое используется при подключении к API.                                                                                                                                                                                                                                                                                         |

## Способы авторизации

Для авторизации запросов вы можете использовать:

- ключ авторизации, полученный в личном кабинете;
- имя пользователя и пароль для доступа к GigaChat API;
- mTLS-сертификаты;
- токен доступа (access token), полученный в обмен на ключ авторизации в запросе [`POST /api/v2/oauth`](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-token).

### Пример авторизации с помощью ключа

```ts
const client = new GigaChat({
  credentials: 'ключ_авторизации',
  scope: 'версия API',
});
```

По умолчанию запросы передаются в версию для физических лиц `GIGACHAT_API_PERS`.

### Пример авторизации с помощью логина и пароля

```ts
const client = new GigaChat({
  baseUrl: 'базовый url GigaChat API',
  user: 'логин',
  password: 'пароль',
});
```

### Пример авторизации с помощью mTLS-сертификатов

```ts
import GigaChat from 'gigachat';
import { Agent } from 'node:https';
import fs from 'node:fs';

const httpsAgent = new Agent({
  ca: fs.readFileSync('certs/ca.pem'),
  cert: fs.readFileSync('certs/tls.pem'),
  key: fs.readFileSync('certs/tls.key'),
  passphrase: 'пароль от приватного ключа',
});

const client = new GigaChat({
  baseUrl: 'базовый url GigaChat API',
  httpsAgent: httpsAgent,
});
```

### Пример авторизации с помощью токена доступа

Токен действителен в течение 30 минут.
При использовании такого способа авторизации, в приложении нужно реализовать механизм обновления токена.

```ts
const client = new GigaChat({
  baseUrl: 'базовый url GigaChat API',
  accessToken: 'токен',
});
```

### Предварительная авторизация

По умолчанию, библиотека GigaChat получает токен доступа при первом запросе к API.

Если вам нужно получить токен и авторизоваться до выполнения запроса, инициализируйте объект GigaChat и вызовите метод `updateToken()`.

```ts
const client = new GigaChat({
  credentials: 'ключ_атворизации',
  scope: 'версия API',
});
await giga.updateToken();
```

По умолчанию запросы передаются в версию для физических лиц `GIGACHAT_API_PERS`.

> [!NOTE]
> Токен действителен в течение 30 минут.

## Настройка переменных окружения

Чтобы задать параметры с помощью переменных окружения, в названии переменной используйте префикс `GIGACHAT_`:

```sh
export GIGACHAT_CREDENTIALS
export GIGACHAT_SCOPE
export GIGACHAT_ACCESS_TOKEN
export GIGACHAT_USER
export GIGACHAT_PASSWORD
...
```

Пример переменных окружения, которые задают ключ авторизации и версию API.

```sh
export GIGACHAT_CREDENTIALS=...
export GIGACHAT_SCOPE=...
```
