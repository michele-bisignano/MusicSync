import {
  SendMessageOptions,
  EditMessageTextOptions,
  TelegramMessage,
} from './telegram_types.js';

export interface ITelegramClient {
  sendMessage(
    chatId: number | string,
    text: string,
    options?: SendMessageOptions
  ): Promise<TelegramMessage>;

  editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: EditMessageTextOptions
  ): Promise<TelegramMessage>;

  answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean
  ): Promise<boolean>;
}

export class HttpTelegramClient implements ITelegramClient {
  private readonly baseUrl: string;

  constructor(token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options: SendMessageOptions = {}
  ): Promise<TelegramMessage> {
    const payload = {
      chat_id: chatId,
      text,
      ...options,
    };

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; result?: TelegramMessage; description?: string };
    if (!data.ok || !data.result) {
      throw new Error(`Telegram sendMessage failed: ${data.description || res.statusText}`);
    }

    return data.result;
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options: EditMessageTextOptions = {}
  ): Promise<TelegramMessage> {
    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    };

    const res = await fetch(`${this.baseUrl}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; result?: TelegramMessage; description?: string };
    if (!data.ok || !data.result) {
      throw new Error(`Telegram editMessageText failed: ${data.description || res.statusText}`);
    }

    return data.result;
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false
  ): Promise<boolean> {
    const payload = {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    };

    const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as { ok: boolean; description?: string };
    return Boolean(data.ok);
  }
}
