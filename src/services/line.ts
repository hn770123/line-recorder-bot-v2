/**
 * @file LineClient
 * @description LINE Messaging APIとの連携を管理するクライアント。
 *              メッセージの送受信、プロフィール取得、署名検証などの機能を提供します。
 */

import { Env } from '../db/BaseRepository';

// LINE APIの基本URL
const LINE_API_BASE_URL = 'https://api.line.me/v2/bot';

/**
 * @interface LineProfile
 * @description LINEユーザーまたはグループメンバーのプロフィール情報
 */
export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export class LineClient {
  private channelAccessToken: string;
  private channelSecret: string;
  private bypassLineValidation: boolean;

  constructor(env: Env) {
    this.channelAccessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
    this.channelSecret = env.LINE_CHANNEL_SECRET;
    this.bypassLineValidation = env.BYPASS_LINE_VALIDATION === 'true';
  }

  /**
   * @method replyMessage
   * @description LINEのイベントに対してメッセージを返信します。
   * @param {string} replyToken 返信トークン
   * @param {any[]} messages 送信するメッセージオブジェクトの配列
   * @returns {Promise<Response>} fetch APIのレスポンス
   */
  async replyMessage(replyToken: string, messages: any[]): Promise<Response> {
    const url = `${LINE_API_BASE_URL}/message/reply`;
    const body = {
      replyToken: replyToken,
      messages: messages,
    };
    return this.post(url, body);
  }

  /**
   * @method pushMessage
   * @description 指定されたユーザー、グループ、またはルームにメッセージをプッシュ送信します。
   * @param {string} to 送信先ID (ユーザーID, グループID, またはルームID)
   * @param {any[]} messages 送信するメッセージオブジェクトの配列
   * @returns {Promise<Response>} fetch APIのレスポンス
   */
  async pushMessage(to: string, messages: any[]): Promise<Response> {
    const url = `${LINE_API_BASE_URL}/message/push`;
    const body = {
      to: to,
      messages: messages,
    };
    return this.post(url, body);
  }

  /**
   * @method getProfile
   * @description ユーザーIDに基づいてプロフィール情報を取得します。
   * @param {string} userId 取得するユーザーのID
   * @returns {Promise<LineProfile>} ユーザーのプロフィール情報
   */
  async getProfile(userId: string): Promise<LineProfile> {
    const url = `${LINE_API_BASE_URL}/profile/${userId}`;
    const response = await this.get(url);
    if (!response.ok) {
      console.error(`Failed to get profile for userId: ${userId}, Status: ${response.status}`);
      throw new Error(`LINE API error: ${response.status}`);
    }
    return response.json();
  }

  /**
   * @method getGroupMemberProfile
   * @description グループIDとユーザーIDに基づいてグループメンバーのプロフィール情報を取得します。
   * @param {string} groupId グループID
   * @param {string} userId 取得するメンバーのユーザーID
   * @returns {Promise<LineProfile>} グループメンバーのプロフィール情報
   */
  async getGroupMemberProfile(groupId: string, userId: string): Promise<LineProfile> {
    const url = `${LINE_API_BASE_URL}/group/${groupId}/member/${userId}`;
    const response = await this.get(url);
    if (!response.ok) {
      console.error(`Failed to get group member profile for groupId: ${groupId}, userId: ${userId}, Status: ${response.status}`);
      throw new Error(`LINE API error: ${response.status}`);
    }
    return response.json();
  }

  /**
   * @method validateSignature
   * @description LINEからのWebhookリクエストの署名を検証します。
   * @param {string} signature LINE-Signatureヘッダーの値
   * @param {string} body リクエストボディの生データ
   * @returns {Promise<boolean>} 署名が有効な場合はtrue、そうでない場合はfalse
   */
  async validateSignature(signature: string, body: string): Promise<boolean> {
    if (this.bypassLineValidation) {
      return true;
    }

    // Web Crypto APIはWorkersで利用可能です。
    // https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(mac)));

    return expectedSignature === signature;
  }

  /**
   * @method post
   * @description LINE APIへのPOSTリクエストを実行します。
   * @param {string} url リクエストURL
   * @param {object} body 送信するJSONボディ
   * @returns {Promise<Response>} fetch APIのレスポンス
   */
  private async post(url: string, body: object): Promise<Response> {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.channelAccessToken}`,
    };
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
  }

  /**
   * @method get
   * @description LINE APIへのGETリクエストを実行します。
   * @param {string} url リクエストURL
   * @returns {Promise<Response>} fetch APIのレスポ */
  private async get(url: string): Promise<Response> {
    const headers = {
      'Authorization': `Bearer ${this.channelAccessToken}`,
    };
    return fetch(url, {
      method: 'GET',
      headers: headers,
    });
  }
}
